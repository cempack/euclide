"""Pronote through pronotepy: QR-code and password login, schedule sync,
lesson contents and the class list.

Every handler takes the request payload (credentials plus parameters) and
returns a plain dict; the server wraps it in the protocol envelope.
"""

import datetime
import json
import os


def _account_name(client):
    info = getattr(client, "info", None)
    if info is not None and getattr(info, "name", None):
        return info.name
    return "Mon compte"


def _clean_group(names):
    if not names:
        return ""
    out = []
    for n in names:
        out.append(str(n).strip().strip("[]"))
    return ", ".join([x for x in out if x])


def _lessons_for_week(client):
    """Collect this week's lessons mapped to a weekly grid (1=Mon..7=Sun)."""
    import datetime as dt

    lessons = []
    seen = set()
    today = dt.date.today()
    monday = today - dt.timedelta(days=today.weekday())
    try:
        # The whole week in one request (seven on a slow school network cost seconds).
        week = [(None, client.lessons(monday, monday + dt.timedelta(days=6)))]
    except Exception:  # noqa: BLE001 - an older server: one day at a time
        week = []
        for offset in range(7):
            try:
                week.append((offset, client.lessons(monday + dt.timedelta(days=offset))))
            except Exception:  # noqa: BLE001
                continue
    for offset, day_lessons in week:
        for les in day_lessons:
            if getattr(les, "canceled", False):
                continue
            start = getattr(les, "start", None)
            end = getattr(les, "end", None)
            subject = getattr(getattr(les, "subject", None), "name", None) or "Cours"
            room = getattr(les, "classroom", "") or ""
            group = _clean_group(getattr(les, "group_names", None))
            if start:
                dow = start.weekday() + 1
            elif offset is not None:
                dow = offset + 1
            else:
                continue
            start_s = start.strftime("%H:%M") if start else ""
            end_s = end.strftime("%H:%M") if end else ""
            key = (dow, start_s, end_s, subject, group)
            if key in seen:
                continue
            seen.add(key)
            lessons.append(
                {
                    "day_of_week": dow,
                    "start_time": start_s,
                    "end_time": end_s,
                    "subject": subject,
                    "room": room,
                    "group": group,
                }
            )
    lessons.sort(key=lambda x: (x["day_of_week"], x["start_time"]))
    return lessons


_cached_client = None
_cached_url = None
_cached_username = None
_cached_password = None


def _save_to_cache(client, url, username, password):
    global _cached_client, _cached_url, _cached_username, _cached_password
    _cached_client = client
    _cached_url = url
    _cached_username = username
    _cached_password = password


def _clear_cache():
    global _cached_client, _cached_url, _cached_username, _cached_password
    _cached_client = None
    _cached_url = None
    _cached_username = None
    _cached_password = None


def _normalize_pronote_url(url):
    """Teachers usually paste the establishment root (`…/pronote/`).

    pronotepy needs the account page (`professeur.html` / `eleve.html`).
    Without it the AES challenge fails with the same 'un pad' error as a
    bad password. Euclide is a teaching desk, so a bare /pronote root
    becomes the professeur page. An explicit page is left alone.
    """
    from urllib.parse import urlsplit, urlunsplit

    raw = (url or "").strip()
    if not raw:
        return raw
    if "://" not in raw:
        raw = "https://" + raw
    parts = urlsplit(raw)
    path = parts.path or ""
    leaf = path.rstrip("/").rsplit("/", 1)[-1] if path else ""
    if leaf.endswith(".html") or leaf.endswith(".htm"):
        return urlunsplit((parts.scheme, parts.netloc, path, parts.query, ""))
    trimmed = path.rstrip("/")
    if trimmed.endswith("/pronote") or trimmed == "/pronote":
        path = trimmed + "/professeur.html"
    elif trimmed == "":
        path = "/pronote/professeur.html"
    return urlunsplit((parts.scheme, parts.netloc, path, parts.query, ""))


def _password_login_kwargs(pin, device_name, client_id):
    """PIN registers a device. Sending `device_name` without a PIN (or a
    leftover `client_identifier` from another account) makes Pronote
    derive the wrong AES key and fail with the un-pad error.
    """
    kwargs = {}
    if pin:
        kwargs["account_pin"] = str(pin)
        if device_name:
            kwargs["device_name"] = str(device_name)
    if client_id:
        kwargs["client_identifier"] = str(client_id)
    return kwargs


def _is_login_crypto_error(exc):
    text = str(exc).lower()
    return any(needle in text for needle in ("decrypt", "un pad", "unpad", "bad username", "bad password"))


def _login_error_payload(exc, *, offered_pin):
    if _is_login_crypto_error(exc):
        if not offered_pin:
            return {
                "ok": False,
                "needs_pin": True,
                "error": (
                    "NEEDS_PIN:Identifiants refusés. Vérifiez l'adresse Pronote "
                    "(page professeur.html), l'identifiant et le mot de passe. "
                    "Si le compte exige un code PIN, saisissez-le. "
                    "Les établissements avec ENT se connectent par QR code."
                ),
            }
        return {
            "ok": False,
            "error": (
                "Identifiants refusés. Vérifiez l'adresse Pronote, l'identifiant, "
                "le mot de passe et le code PIN. Les établissements avec ENT "
                "se connectent par QR code."
            ),
        }
    err_str = str(exc).lower()
    if "pin" in err_str or "appareil" in err_str or "device" in err_str:
        return {"ok": False, "error": f"NEEDS_PIN:Code PIN requis : {exc}", "needs_pin": True}
    return {"ok": False, "error": f"Connexion refusée : {exc}"}


def _open_password_client(pronotepy, url, username, password, pin, device_name, client_id):
    kwargs = _password_login_kwargs(pin, device_name, client_id)
    try:
        return pronotepy.Client(url, username, password, **kwargs)
    except Exception as exc:  # noqa: BLE001
        if client_id and _is_login_crypto_error(exc):
            retry = _password_login_kwargs(pin, device_name, None)
            return pronotepy.Client(url, username, password, **retry)
        raise


# The establishment handed out no QR code once: don't ask again this session.
_token_refused = False


def _trade_for_token(pronotepy, client, uuid, account_pin=None, device_name=None):
    """The same account, logged in again with a token instead of its
    password, as Pronote's mobile app does with a QR code: the session asks
    for the QR code's data itself. From then on Euclide keeps Pronote's
    rotating token only, never the password, and any PC can use it.

    None where the establishment hands out no QR code (the public demo
    doesn't): the password login goes on as before.
    """
    global _token_refused
    if _token_refused or not uuid:
        return None
    pin = f"{int.from_bytes(os.urandom(2), 'big') % 10000:04d}"
    try:
        data = client.request_qr_code_data(pin)
    except Exception:  # noqa: BLE001
        data = {}
    if not data.get("jeton") or not data.get("login"):
        _token_refused = True
        return None
    try:
        token = pronotepy.Client.qrcode_login(
            data, pin, uuid, account_pin=account_pin, device_name=device_name
        )
    except Exception:  # noqa: BLE001
        return None
    return token if getattr(token, "logged_in", False) else None


def _credentials_reply(client):
    """What Euclide keeps for the next call: the token that just rotated, or
    the login of a password session; `token` says which."""
    return {
        "username": client.username,
        "password": client.password,
        "client_identifier": getattr(client, "client_identifier", None) or "",
        "token": getattr(client, "login_mode", "") == "token",
        "url": client.pronote_url,
        "uuid": getattr(client, "uuid", None) or "",
    }


def _get_client(payload):
    global _cached_client, _cached_url, _cached_username, _cached_password
    import pronotepy

    mode = payload.get("mode") or "qr"
    url = _normalize_pronote_url(payload.get("url") or "")
    username = payload.get("username")
    password = payload.get("password")
    uuid = str(payload.get("uuid") or "")
    pin = payload.get("pin") or None
    device_name = payload.get("device_name") or None
    client_id = payload.get("client_identifier") or None

    if not all([url, username, password]):
        raise ValueError("Identifiants Pronote incomplets.")

    # Check if cached client is valid and matches credentials
    if (
        _cached_client is not None
        and getattr(_cached_client, "logged_in", False)
        and _cached_url == url
        and _cached_username == username
        and _cached_password == password
    ):
        return _cached_client

    client = None
    if mode == "password":
        client = _open_password_client(pronotepy, url, username, password, pin, device_name, client_id)
        token = _trade_for_token(pronotepy, client, uuid, pin, device_name)
        if token is not None:
            _save_to_cache(token, token.pronote_url, token.username, token.password)
            return token
    else:
        try:
            login_args = [url, username, password, uuid]
            if client_id:
                client = pronotepy.Client.token_login(*login_args, client_identifier=str(client_id))
            else:
                client = pronotepy.Client.token_login(*login_args)
        except Exception:  # noqa: BLE001
            client = None

        # Auto-retry with direct login if token_login failed (token rotation race)
        if client is None or not getattr(client, "logged_in", False):
            if mode != "password":
                try:
                    client = pronotepy.Client(url, username, password)
                except Exception as exc:  # noqa: BLE001
                    _clear_cache()
                    raise exc
            if client is None or not getattr(client, "logged_in", False):
                _clear_cache()
                raise Exception("Session Pronote expiree.")

    _save_to_cache(client, url, client.username, client.password)
    return client


def pronote_login(payload):
    try:
        import pronotepy  # noqa: F401 - availability check
    except ImportError:
        return {"ok": False, "error": "pronotepy n'est pas installe dans le sidecar."}

    qr = payload.get("qr")
    if isinstance(qr, str):
        try:
            qr = json.loads(qr)
        except json.JSONDecodeError:
            return {"ok": False, "error": "QR code illisible (JSON invalide)."}

    pin = str(payload.get("pin", ""))
    uuid = str(payload.get("uuid", ""))

    try:
        client = pronotepy.Client.qrcode_login(qr, pin, uuid)
    except Exception as exc:  # noqa: BLE001
        return _login_error_payload(exc, offered_pin=bool(pin))

    if not getattr(client, "logged_in", False):
        return {"ok": False, "error": "Identifiants invalides."}

    # Save to cache so that the first sync immediately afterwards can reuse it without token_login
    _save_to_cache(client, client.pronote_url, client.username, client.password)

    # username/password are the rotating token credentials for token_login().
    return {
        "ok": True,
        "account_name": _account_name(client),
        "url": client.pronote_url,
        "username": client.username,
        "password": client.password,
        "uuid": uuid,
    }


def pronote_password_login(payload):
    """Direct URL + username + password login (non-ENT / demo accounts).
    Supports optional account_pin (PIN code), device_name and client_identifier
    for accounts that have PIN authentication enabled.
    """
    try:
        import pronotepy  # noqa: F401 - availability check
    except ImportError:
        return {"ok": False, "error": "pronotepy n'est pas installe dans le sidecar."}

    url = _normalize_pronote_url(str(payload.get("url", "")))
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    pin = payload.get("pin") or None
    device_name = payload.get("device_name") or None
    client_id = payload.get("client_identifier") or None

    if not all([url, username, password]):
        return {"ok": False, "error": "URL, identifiant et mot de passe requis."}

    try:
        client = _open_password_client(pronotepy, url, username, password, pin, device_name, client_id)
    except Exception as exc:  # noqa: BLE001
        return _login_error_payload(exc, offered_pin=bool(pin))

    if not getattr(client, "logged_in", False):
        return {"ok": False, "error": "Identifiants invalides."}

    token = _trade_for_token(pronotepy, client, str(payload.get("uuid") or ""), pin, device_name)
    if token is not None:
        _save_to_cache(token, token.pronote_url, token.username, token.password)
        return {"ok": True, "mode": "qr", "account_name": _account_name(token), **_credentials_reply(token)}

    # Save to cache
    _save_to_cache(client, url, username, password)

    # Return client_identifier so the Rust layer can persist it for future sessions
    cid = getattr(client, "client_identifier", None) or ""

    return {
        "ok": True,
        "mode": "password",
        "account_name": _account_name(client),
        "url": url,
        "username": username,
        "password": password,
        "client_identifier": cid,
    }


def pronote_sync(payload):
    try:
        import pronotepy  # noqa: F401 - availability check
    except ImportError:
        return {"ok": False, "error": "pronotepy n'est pas installe dans le sidecar."}

    try:
        client = _get_client(payload)
        lessons = _lessons_for_week(client)
    except Exception:  # noqa: BLE001
        # Retry once after clearing cache (in case session expired)
        _clear_cache()
        try:
            client = _get_client(payload)
            lessons = _lessons_for_week(client)
        except Exception as retry_exc:  # noqa: BLE001
            return {"ok": False, "error": f"Session Pronote expiree ou erreur : {retry_exc}"}

    # A token rotates on every login: return the fresh one so it is kept.
    return {
        "ok": True,
        "account_name": _account_name(client),
        "lessons": lessons,
        **_credentials_reply(client),
    }


def _french_date_label(date_str: str) -> str:
    """Turn '01/05/2025 09:00:00' into 'Vendredi 01 mai' style label."""
    import datetime as dt

    jours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
    mois = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
    try:
        core = (date_str or "").split()[0]
        d = dt.datetime.strptime(core, "%d/%m/%Y").date()
        return f"{jours[d.weekday()]} {d.day:02d} {mois[d.month - 1]}"
    except Exception:  # noqa: BLE001
        return date_str or ""


def _lesson_contents(client, days_back: int = 365, classe: dict | None = None, date_debut: str | None = None):
    """Fetch 'contenu des cours' (lesson contents) from the cahier de textes.
    Supports optional `classe` dict ({"N": "...", "G": 1}) to scope to a specific class
    (important for teacher / multi-class accounts). For professeur accounts the request
    uses `ressource` (and `classe`) + estCours/avecCoursAnnules to emulate "Contenu de mes
    cours" / "Vision élève" per-class view.
    `date_debut` limits the range (e.g. "2025-04-27" or "27/04/2025").
    Returns richer items with date_label, start_time, end_time etc.
    Also includes `documents` (attached files / pièces jointes / links) when present
    in the ListePieceJointe of the contenu.
    """
    import datetime as dt
    import re
    from html import unescape

    # For constructing proper attachment URLs (files + links)
    try:
        from pronotepy.dataClasses import Attachment
    except Exception:  # noqa: BLE001
        Attachment = None

    today = dt.date.today()

    # Determine week range
    d0 = None
    if date_debut:
        try:
            s = str(date_debut).strip()
            if "-" in s and len(s) >= 10:
                d0 = dt.datetime.strptime(s[:10], "%Y-%m-%d").date()
            else:
                core = s.split()[0] if " " in s else s
                d0 = dt.datetime.strptime(core, "%d/%m/%Y").date()
        except Exception:  # noqa: BLE001
            d0 = None
    full_first = max(0, client.get_week(today - dt.timedelta(days=days_back)))
    first_w = max(0, client.get_week(d0)) if d0 else full_first
    last_w = max(0, client.get_week(today + dt.timedelta(days=28)))
    if first_w > last_w:
        first_w = last_w

    items = []
    seen = set()

    def fetch(first, last):
        """The range in one request (fast), else week by week."""
        lst = None
        try:
            data = {"domaine": {"_T": 8, "V": f"[{first}..{last}]"}}
            if classe:
                data["ressource"] = classe
                data["classe"] = classe
                data["estCours"] = True
                data["avecCoursAnnules"] = True
            resp = client.post("PageCahierDeTexte", 89, data)
            lst = resp.get("dataSec", {}).get("data", {}).get("ListeCahierDeTextes", {}).get("V", [])
        except Exception:  # noqa: BLE001
            lst = None
        if not lst:
            lst = []
            for w in range(first, last + 1):
                try:
                    data = {"domaine": {"_T": 8, "V": f"[{w}..{w}]"}}
                    if classe:
                        data["ressource"] = classe
                        data["classe"] = classe
                        data["estCours"] = True
                        data["avecCoursAnnules"] = True
                    resp = client.post("PageCahierDeTexte", 89, data)
                    sub_lst = (
                        resp.get("dataSec", {}).get("data", {}).get("ListeCahierDeTextes", {}).get("V", [])
                    )
                    if sub_lst:
                        lst.extend(sub_lst)
                except Exception:  # noqa: BLE001
                    continue
        return lst

    lst = fetch(first_w, last_w)
    # Some servers number weeks so that a range starting mid-year comes back
    # empty: then fetch the whole range and keep the period by date below.
    if not lst and d0 and first_w > full_first:
        lst = fetch(full_first, last_w)

    for e in lst:
        conts = (e.get("listeContenus") or {}).get("V") or []
        if not conts:
            continue
        c = conts[0]
        mat = (e.get("Matiere") or {}).get("V") or {}
        subject = mat.get("L") or ""
        groups = [(g or {}).get("L", "") for g in ((e.get("listeGroupes") or {}).get("V") or [])]
        profs = [(p or {}).get("L", "") for p in ((e.get("listeProfesseurs") or {}).get("V") or [])]
        title = c.get("L") or ""
        raw_desc = (c.get("descriptif") or {}).get("V") or ""
        # basic html strip for readability (keeps the text content)
        desc = unescape(re.sub(r"<[^>]+>", " ", raw_desc)).strip()
        desc = re.sub(r"\s+", " ", desc).strip()
        cat_obj = (c.get("categorie") or {}).get("V") or {}
        category = cat_obj.get("L") or ""
        date_str = (e.get("Date") or {}).get("V") or ""
        end_str = (e.get("DateFin") or {}).get("V") or ""

        # parse times
        start_time = ""
        end_time = ""
        try:
            if date_str:
                dtm = dt.datetime.strptime(date_str.split(".")[0], "%d/%m/%Y %H:%M:%S")
                start_time = dtm.strftime("%H:%M")
            if end_str:
                dtm2 = dt.datetime.strptime(end_str.split(".")[0], "%d/%m/%Y %H:%M:%S")
                end_time = dtm2.strftime("%H:%M")
        except Exception:  # noqa: BLE001
            pass

        # The period asked for, whatever range the server sent back.
        if d0 and date_str:
            try:
                if dt.datetime.strptime(date_str.split()[0], "%d/%m/%Y").date() < d0:
                    continue
            except ValueError:
                pass

        lesson_n = ((e.get("cours") or {}).get("V") or {}).get("N") or ""
        key = (date_str, subject, title)
        if key in seen:
            continue
        seen.add(key)

        # Parse attached documents / pièces jointes (ListePieceJointe on the contenu)
        documents = []
        try:
            pj_list = (c.get("ListePieceJointe") or {}).get("V") or []
            for pj in pj_list:
                try:
                    if Attachment:
                        att = Attachment(client, pj)
                        documents.append(
                            {
                                "name": att.name,
                                "id": att.id,
                                "type": att.type,  # 0 = link, 1 = file
                                "url": att.url,
                                "estUnLienInterne": pj.get("estUnLienInterne", False),
                            }
                        )
                    else:
                        documents.append(
                            {
                                "name": pj.get("L", ""),
                                "id": pj.get("N", ""),
                                "type": pj.get("G", 1),
                                "url": "",
                                "estUnLienInterne": pj.get("estUnLienInterne", False),
                            }
                        )
                except Exception:  # noqa: BLE001
                    documents.append(
                        {
                            "name": pj.get("L", ""),
                            "id": pj.get("N", ""),
                            "type": pj.get("G", 1),
                            "url": "",
                            "estUnLienInterne": pj.get("estUnLienInterne", False),
                        }
                    )
        except Exception:  # noqa: BLE001
            pass

        items.append(
            {
                "date": date_str,
                "end": end_str,
                "date_label": _french_date_label(date_str),
                "start_time": start_time,
                "end_time": end_time,
                "subject": subject,
                "groups": ", ".join([g for g in groups if g]),
                "teachers": ", ".join([p for p in profs if p]),
                "title": title,
                "description": desc,
                "category": category,
                "lesson_id": lesson_n,
                "documents": documents,
            }
        )

    # newest first
    items.sort(key=lambda x: x.get("date") or "", reverse=True)
    return items


def _contents_via_lessons(client, days_back: int = 365, class_name: str | None = None):
    """Alternative way to collect contents: get recent lessons and call .content on each.
    This can surface per-lesson contenus even if the bulk cahier list is empty or not scoped.
    Useful for some teacher accounts (professeur view).
    If class_name is given, we fetch raw EDT to only consider lessons for that class (G=1 in ListeContenus).
    """
    import datetime as dt

    today = dt.date.today()
    from_d = today - dt.timedelta(days=days_back)
    items = []
    seen = set()

    c_low = class_name.lower().strip() if class_name else None

    try:
        # Get raw EDT to be able to filter by class (G=1) for professeur view
        # where parsed group_names (G=2) may not have the main class.
        start = client.start_day
        pu = client.parametres_utilisateur.get("dataSec", {}).get("data", {})
        user = pu.get("ressource", {})
        for w_offset in range(0, 20):  # limit weeks
            d = start + dt.timedelta(weeks=w_offset)
            if d < from_d:
                continue
            week = client.get_week(d)
            data = {
                "ressource": user,
                "NumeroSemaine": week,
                "numeroSemaine": week,
                "avecCoursAnnules": True,
            }
            resp = client.post("PageEmploiDuTemps", 16, data)
            l_list = resp.get("dataSec", {}).get("data", {}).get("ListeCours", [])
            for raw in l_list:
                # Check if matches class
                if c_low:
                    matches_class = False
                    for it in raw.get("ListeContenus", {}).get("V", []):
                        if it.get("G") == 1 and c_low in (it.get("L") or "").lower():
                            matches_class = True
                            break
                    if not matches_class:
                        continue
                # Now try to get a live Lesson for .content (or parse minimal)
                # For simplicity, use client.lessons around the date and match by N
                try:
                    date_val = raw.get("DateDuCours")
                    if isinstance(date_val, dict):
                        date_val = date_val.get("V")
                    if date_val:
                        # parse rough date
                        day = dt.datetime.strptime(date_val.split()[0], "%d/%m/%Y").date()
                        ls = client.lessons(day, day)
                        for les in ls:
                            if getattr(les, "id", None) == raw.get("N"):
                                cont = les.content
                                if cont:
                                    subject = getattr(getattr(les, "subject", None), "name", "") or ""
                                    groups = getattr(les, "group_names", []) or []
                                    teachers = getattr(les, "teacher_names", []) or []
                                    date_str = les.start.strftime("%d/%m/%Y %H:%M:%S") if les.start else ""
                                    end_str = les.end.strftime("%d/%m/%Y %H:%M:%S") if les.end else ""
                                    key = (date_str, subject, cont.title)
                                    if key in seen:
                                        continue
                                    seen.add(key)
                                    # documents from LessonContent.files (if .content succeeded)
                                    documents = []
                                    try:
                                        for f in getattr(cont, "files", []) or []:
                                            documents.append(
                                                {
                                                    "name": getattr(f, "name", ""),
                                                    "id": getattr(f, "id", ""),
                                                    "type": getattr(f, "type", 0),
                                                    "url": getattr(f, "url", ""),
                                                }
                                            )
                                    except Exception:  # noqa: BLE001
                                        pass

                                    items.append(
                                        {
                                            "date": date_str,
                                            "end": end_str,
                                            "date_label": _french_date_label(date_str),
                                            "start_time": les.start.strftime("%H:%M") if les.start else "",
                                            "end_time": les.end.strftime("%H:%M") if les.end else "",
                                            "subject": subject,
                                            "groups": ", ".join([g for g in groups if g]),
                                            "teachers": ", ".join([t for t in teachers if t]),
                                            "title": cont.title or "",
                                            "description": (cont.description or "").strip(),
                                            "category": getattr(cont, "category", "") or "",
                                            "lesson_id": getattr(les, "id", ""),
                                            "documents": documents,
                                        }
                                    )
                                break
                except Exception:
                    continue
    except Exception:  # noqa: BLE001
        # fallback to simple lessons() without class filter
        try:
            lessons = client.lessons(from_d, today + dt.timedelta(days=14))
            for les in lessons:
                try:
                    cont = les.content
                    if not cont:
                        continue
                    subject = getattr(getattr(les, "subject", None), "name", "") or ""
                    groups = getattr(les, "group_names", []) or []
                    teachers = getattr(les, "teacher_names", []) or []
                    date_str = les.start.strftime("%d/%m/%Y %H:%M:%S") if les.start else ""
                    end_str = les.end.strftime("%d/%m/%Y %H:%M:%S") if les.end else ""
                    key = (date_str, subject, cont.title)
                    if key in seen:
                        continue
                    seen.add(key)
                    # documents from LessonContent.files
                    documents = []
                    try:
                        for f in getattr(cont, "files", []) or []:
                            documents.append(
                                {
                                    "name": getattr(f, "name", ""),
                                    "id": getattr(f, "id", ""),
                                    "type": getattr(f, "type", 0),
                                    "url": getattr(f, "url", ""),
                                }
                            )
                    except Exception:  # noqa: BLE001
                        pass

                    items.append(
                        {
                            "date": date_str,
                            "end": end_str,
                            "date_label": _french_date_label(date_str),
                            "start_time": les.start.strftime("%H:%M") if les.start else "",
                            "end_time": les.end.strftime("%H:%M") if les.end else "",
                            "subject": subject,
                            "groups": ", ".join([g for g in groups if g]),
                            "teachers": ", ".join([t for t in teachers if t]),
                            "title": cont.title or "",
                            "description": (cont.description or "").strip(),
                            "category": getattr(cont, "category", "") or "",
                            "lesson_id": getattr(les, "id", ""),
                            "documents": documents,
                        }
                    )
                except Exception:
                    continue
        except Exception:
            pass

    items.sort(key=lambda x: x.get("date") or "", reverse=True)
    return items


def pronote_contents(payload):
    """Get lesson contents (le contenu des cours) for the logged-in account.
    Supports filtering by:
      - subject (partial match)
      - class / classe / group (name match against the account's listeClasses, or against
        the groups reported on the entries). On teacher accounts (professeur view) this will
        try to scope the PageCahierDeTexte request to the chosen class using "ressource"
        (and "classe") param + estCours/avecCoursAnnules to match the "Contenu de mes cours"
        / vision classe UI. Falls back to client-side filtering (only when no server scope)
        and also tries per-lesson .content collection.
      - from_date / date_debut (YYYY-MM-DD or DD/MM/YYYY) to only fetch recent contents.
    Also returns a `matieres` array (name + count) suitable for a sidebar like the one in
    Pronote's "Contenu de mes cours" / "Vision élève" view (as in the screenshot).
    Each content item now also includes a `documents` list (attached files + links from
    ListePieceJointe) with name, id, type (0=link/1=file), url (ready to download or open),
    etc.
    Use with professor credentials + class="3D" (or "3A") should return the contents for that
    class when published/available in your Pronote instance.
    """
    try:
        import pronotepy  # noqa: F401 - availability check
    except ImportError:
        return {"ok": False, "error": "pronotepy n'est pas installe dans le sidecar."}

    try:
        client = _get_client(payload)
        # Verify it works
        _ = client.info
    except Exception:  # noqa: BLE001
        _clear_cache()
        try:
            client = _get_client(payload)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Session Pronote expiree ou erreur : {exc}"}

    # Resolve class filter to a proper Pronote classe object when possible.
    # This is key for teacher accounts that can see multiple classes.
    classes_raw = (
        client.parametres_utilisateur.get("dataSec", {}).get("data", {}).get("listeClasses", {}).get("V", [])
    )
    class_map = {}
    for c in classes_raw:
        name = (c.get("L") or "").strip()
        if name:
            class_map[name.upper()] = {"N": c.get("N"), "G": 1}

    subject = payload.get("subject")
    class_filter = payload.get("class") or payload.get("classe") or payload.get("group")
    from_date = payload.get("from_date") or payload.get("date_debut") or payload.get("depuis")

    classe_dict = None
    if class_filter:
        key = str(class_filter).strip().upper()
        if key in class_map:
            classe_dict = class_map[key]
        else:
            # fuzzy: contains match
            for k, v in class_map.items():
                if key in k or k in key:
                    classe_dict = v
                    break

    all_contents = _lesson_contents(
        client,
        classe=classe_dict,
        date_debut=from_date,
    )

    filtered = all_contents
    if subject:
        s_low = str(subject).lower().strip()
        filtered = [c for c in filtered if s_low in c.get("subject", "").lower()]
    if class_filter and not classe_dict:
        # fallback: still filter client-side on the groups/subject strings we got back
        # (only when we could not scope server-side via classe_dict / ressource)
        c_low = str(class_filter).lower().strip()
        filtered = [
            c
            for c in filtered
            if c_low in c.get("groups", "").lower() or c_low in c.get("subject", "").lower()
        ]

    # Also try the per-lesson .content path (helps on some teacher accounts / views
    # where the bulk ListeCahierDeTextes is empty but individual lessons have contenus).
    via_lessons = _contents_via_lessons(client, class_name=class_filter)
    seen_keys = {(i.get("date"), i.get("title")) for i in filtered}
    for v in via_lessons:
        k = (v.get("date"), v.get("title"))
        if k not in seen_keys:
            filtered.append(v)
            seen_keys.add(k)

    # Re-apply class filter to the merged list (important for via_lessons items)
    # but only when no server-side classe scoping was used; otherwise the items are
    # already class-specific (groups may be empty as class is implicit in request scope)
    if class_filter and not classe_dict:
        c_low = str(class_filter).lower().strip()
        filtered = [
            c
            for c in filtered
            if c_low in c.get("groups", "").lower() or c_low in c.get("subject", "").lower()
        ]

    # Build matieres summary (name + count) for a left sidebar, like Pronote's UI
    from collections import Counter

    counts = Counter(c.get("subject", "") for c in filtered if c.get("subject"))
    matieres = [
        {"name": name, "count": cnt}
        for name, cnt in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        if name
    ]

    # The fresh token, kept like sync's, and the contents.
    return {
        "ok": True,
        "account_name": _account_name(client),
        "contents": filtered,
        "matieres": matieres,
        "classe_used": classe_dict,
        **_credentials_reply(client),
    }


def pronote_classes(payload):
    """Return the list of classes (listeClasses) for the logged-in prof/teacher account.
    Used to populate dropdowns instead of free-text class names.
    """
    try:
        import pronotepy  # noqa: F401 - availability check
    except ImportError:
        return {"ok": False, "error": "pronotepy n'est pas installe dans le sidecar."}

    try:
        client = _get_client(payload)
        # Verify it works
        _ = client.info
    except Exception:  # noqa: BLE001
        _clear_cache()
        try:
            client = _get_client(payload)
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Session Pronote expiree ou erreur : {exc}"}

    classes = [
        {"name": (c.get("L") or "").strip(), "N": c.get("N"), "G": c.get("G", 1)}
        for c in _main_classes(client)
    ]

    return {
        "ok": True,
        "classes": classes,
        "account_name": _account_name(client),
        **_credentials_reply(client),
    }


def _account_classes(client):
    """The classes the account sees (`listeClasses`), as pronotepy's
    VieScolaireClient.classes reads them."""
    return (
        client.parametres_utilisateur.get("dataSec", {}).get("data", {}).get("listeClasses", {}).get("V", [])
    )


def _main_classes(client):
    """The account's classes without its subgroups, options and codes: a
    class's name has no space, dot, bracket or comma, and 6 signs at most."""
    found = []
    for c in _account_classes(client):
        name = (c.get("L") or "").strip()
        if name and len(name) <= 6 and not any(char in name for char in " .(),"):
            found.append(c)
    return found


def _period(client):
    """The period a class's students are asked for. pronotepy's
    current_period reads a key only student accounts have (a teacher's
    raises KeyError): then the first period today falls in, from the list
    every account has, else the year's first, as StudentClass.students()."""
    try:
        return client.current_period
    except Exception:  # noqa: BLE001
        pass
    periods = client.periods
    now = datetime.datetime.now()
    return next((p for p in periods if p.start <= now <= p.end), periods[0])


def _class_students(client, entry, period):
    """A class's student names: pronotepy's StudentClass.students()
    (ListeRessources, tab 105, the class and a period). Its Student would
    also demand birth dates and projects: only names are read here, so an
    entry missing the rest does not lose the list."""
    res = client.post(
        "ListeRessources",
        105,
        {"classe": {"N": entry.get("N"), "G": 1}, "periode": {"N": period.id, "G": 1}},
    )
    entries = res["dataSec"]["data"]["listeRessources"]["V"]
    return [n for n in (_student_name(e) for e in entries) if n]


def _class_key(name):
    return " ".join(str(name or "").split()).casefold()


def _student_name(entry):
    """« Prénom NOM » from a ListeRessources entry; its « L » (« NOM Prénom ») otherwise."""
    first = " ".join(str(entry.get("prenoms") or "").split())
    last = " ".join(str(entry.get("nom") or "").split())
    if first and last:
        return f"{first} {last}"
    return " ".join(str(entry.get("L") or "").split())


def pronote_students(payload):
    """The names of a class's students, first and last names only, for the
    name picker (_class_students).
    """
    try:
        import pronotepy  # noqa: F401 - availability check
    except ImportError:
        return {"ok": False, "error": "pronotepy n'est pas installé dans le sidecar."}

    wanted = _class_key(payload.get("class"))
    if not wanted:
        return {"ok": False, "error": "Aucune classe choisie."}
    try:
        client = _get_client(payload)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Session Pronote expirée ou erreur : {exc}"}

    # From here the token has turned: every reply hands the new one back.
    reply = _credentials_reply(client)
    match = next((c for c in _account_classes(client) if _class_key(c.get("L")) == wanted), None)
    if match is None:
        return {
            "ok": False,
            "error": f"La classe {payload.get('class')} n'est pas dans votre Pronote.",
            **reply,
        }
    try:
        names = _class_students(client, match, _period(client))
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": f"Pronote ne donne pas la liste des élèves de {match.get('L')} : {exc}",
            **reply,
        }
    return {
        "ok": True,
        "class": match.get("L"),
        "names": names,
        "account_name": _account_name(client),
        **reply,
    }


def pronote_all_students(payload):
    """Every class of the account with its students, in one session: as
    pronotepy's VieScolaireClient.classes, then StudentClass.students() for
    each, on the teacher's own classes (the ones the class pickers show). A
    class Pronote refuses is told apart; the others come back all the same.
    """
    try:
        import pronotepy  # noqa: F401 - availability check
    except ImportError:
        return {"ok": False, "error": "pronotepy n'est pas installé dans le sidecar."}
    try:
        client = _get_client(payload)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Session Pronote expirée ou erreur : {exc}"}

    # From here the token has turned: every reply hands the new one back.
    reply = _credentials_reply(client)
    try:
        period = _period(client)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Pronote ne donne pas la période en cours : {exc}", **reply}
    classes, failed = [], []
    for entry in _main_classes(client):
        name = (entry.get("L") or "").strip()
        try:
            names = _class_students(client, entry, period)
        except Exception as exc:  # noqa: BLE001
            failed.append({"class": name, "error": str(exc)})
            continue
        if names:
            classes.append({"class": name, "names": names})
    return {
        "ok": True,
        "classes": classes,
        "failed": failed,
        "account_name": _account_name(client),
        **reply,
    }
