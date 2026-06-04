#!/usr/bin/env python3
"""Euclide sidecar.

Owns the fragile/heavy work that is awkward in Rust:
  - Pronote (pronotepy) QR-code and token login + schedule sync
  - PDF text extraction for the document search index
  - Running small Python teaching demos
  - Jedi-based autocomplete for the code editor

Protocol (persistent "warm" mode, default for built apps):
  The sidecar is kept alive as a long-running process.
  Send JSON lines on stdin: {"command": "pronote_sync", "payload": {...}}
  Receive exactly one JSON response line on stdout per command (with trailing \n).

Legacy one-shot (for manual/debug): `euclide_sidecar <command> <json-payload>`
  (still supported).

This makes calls snappy: Python runtime + heavy imports (pronotepy, jedi, pypdf)
are loaded once at startup and stay warm. No repeated process spawn/extract even
on low-end machines.

Bundled for distribution with PyInstaller --onedir --noconsole into `euclide-sidecar/`
folder (fast, no console window).
"""

import io
import json
import sys
import contextlib


def reply(obj):
    sys.stdout.write(json.dumps(obj))
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Python demos
# ---------------------------------------------------------------------------

def run_demo(payload):
    path = payload.get("path")
    if not path:
        return {"ok": False, "stdout": "", "stderr": "Chemin manquant."}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            source = fh.read()
    except OSError as exc:
        return {"ok": False, "stdout": "", "stderr": f"Lecture impossible : {exc}"}

    out, err = io.StringIO(), io.StringIO()
    sandbox = {"__name__": "__main__", "__file__": path}
    try:
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            exec(compile(source, path, "exec"), sandbox)  # noqa: S102 - trusted local script
        return {"ok": True, "stdout": out.getvalue(), "stderr": err.getvalue()}
    except Exception as exc:  # noqa: BLE001 - surface any demo error to the UI
        import traceback

        return {
            "ok": False,
            "stdout": out.getvalue(),
            "stderr": err.getvalue() + traceback.format_exc(),
        }


# ---------------------------------------------------------------------------
# Intelligent Python autocomplete via Jedi (used by the CodeEditor in the UI).
# This gives real context-aware suggestions: stdlib, locals, attributes, signatures,
# docstrings, etc. Requires `jedi` in the sidecar environment (see requirements.txt).
# Lines/columns are 1-based (Jedi convention).
# ---------------------------------------------------------------------------

def python_complete(payload):
    code = payload.get("code") or ""
    try:
        line = int(payload.get("line") or 1)
        column = int(payload.get("column") or 1)
    except Exception:
        line, column = 1, 1
    path = payload.get("path") or "<script>.py"

    try:
        import jedi  # type: ignore

        script = jedi.Script(code=code, path=path)
        comps = script.complete(line=line, column=column)
        out = []
        for c in comps[:25]:  # keep popup snappy
            item = {
                "name": c.name,
                "complete": getattr(c, "complete", None),
                "type": getattr(c, "type", None),
                "doc": "",
            }
            # docstring (truncated for UI)
            try:
                ds = c.docstring()
                if ds:
                    item["doc"] = ds[:400]
            except Exception:
                pass
            # signature for callables
            try:
                sigs = c.get_signatures()
                if sigs:
                    item["signature"] = sigs[0].to_string()
            except Exception:
                pass
            out.append(item)
        return {"ok": True, "completions": out}
    except ImportError:
        # Jedi not installed in this sidecar env — graceful fallback (local keywords still work in UI)
        return {"ok": False, "error": "jedi_not_installed", "completions": []}
    except Exception as exc:  # noqa: BLE001
        # e.g. parse error in the snippet; don't crash the sidecar
        return {"ok": False, "error": str(exc), "completions": []}


# ---------------------------------------------------------------------------
# PDF extraction
# ---------------------------------------------------------------------------

def extract_pdf(payload):
    path = payload.get("path")
    if not path:
        return {"text": ""}
    try:
        from pypdf import PdfReader

        reader = PdfReader(path)
        chunks = []
        for page in reader.pages[:60]:  # cap so huge PDFs stay snappy
            try:
                chunks.append(page.extract_text() or "")
            except Exception:  # noqa: BLE001
                continue
        return {"text": "\n".join(chunks)}
    except Exception as exc:  # noqa: BLE001
        return {"text": "", "error": str(exc)}


# ---------------------------------------------------------------------------
# Pronote
# ---------------------------------------------------------------------------

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
    for offset in range(7):
        day = monday + dt.timedelta(days=offset)
        try:
            day_lessons = client.lessons(day)
        except Exception:  # noqa: BLE001
            continue
        for les in day_lessons:
            if getattr(les, "canceled", False):
                continue
            start = getattr(les, "start", None)
            end = getattr(les, "end", None)
            subject = getattr(getattr(les, "subject", None), "name", None) or "Cours"
            room = getattr(les, "classroom", "") or ""
            group = _clean_group(getattr(les, "group_names", None))
            dow = (start.weekday() + 1) if start else (offset + 1)
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


def _get_client(payload):
    global _cached_client, _cached_url, _cached_username, _cached_password
    import pronotepy

    mode = payload.get("mode") or "qr"
    url = payload.get("url")
    username = payload.get("username")
    password = payload.get("password")
    uuid = str(payload.get("uuid", ""))
    pin = str(payload.get("pin", "")).strip()
    client_id = str(payload.get("client_identifier", "")).strip()

    kwargs = {}
    if pin:
        kwargs["account_pin"] = pin
        kwargs["device_name"] = uuid if uuid else "euclide-app"
    if client_id:
        kwargs["client_identifier"] = client_id

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
        client = pronotepy.Client(url, username, password, **kwargs)
    else:
        try:
            # Using token_login. Passing kwargs as well if any identifier is present.
            client = pronotepy.Client.token_login(url, username, password, uuid, client_identifier=client_id if client_id else None)
        except Exception:  # noqa: BLE001
            client = None

        # Auto-retry with direct login if token_login failed (token rotation race)
        if client is None or not getattr(client, "logged_in", False):
            if mode != "password":
                try:
                    client = pronotepy.Client(url, username, password, **kwargs)
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
        import pronotepy
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
        return {"ok": False, "error": f"Connexion refusee : {exc}"}

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
    """Direct URL + username + password login (non-ENT / demo accounts)."""
    try:
        import pronotepy
    except ImportError:
        return {"ok": False, "error": "pronotepy n'est pas installe dans le sidecar."}

    url = str(payload.get("url", "")).strip()
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    pin = str(payload.get("pin", "")).strip()
    uuid_val = str(payload.get("uuid", "")).strip()
    client_id = str(payload.get("client_identifier", "")).strip()

    if not all([url, username, password]):
        return {"ok": False, "error": "URL, identifiant et mot de passe requis."}

    kwargs = {}
    if pin:
        kwargs["account_pin"] = pin
        kwargs["device_name"] = uuid_val if uuid_val else "euclide-app"
    if client_id:
        kwargs["client_identifier"] = client_id

    try:
        client = pronotepy.Client(url, username, password, **kwargs)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Connexion refusee : {exc}"}

    if not getattr(client, "logged_in", False):
        return {"ok": False, "error": "Identifiants invalides."}

    # Save to cache
    _save_to_cache(client, url, username, password)

    return {
        "ok": True,
        "mode": "password",
        "account_name": _account_name(client),
        "url": url,
        "username": username,
        "password": password,
        "client_identifier": getattr(client, "client_identifier", ""),
    }


def pronote_sync(payload):
    try:
        import pronotepy
    except ImportError:
        return {"ok": False, "error": "pronotepy n'est pas installe dans le sidecar."}

    try:
        client = _get_client(payload)
        lessons = _lessons_for_week(client)
    except Exception as exc:  # noqa: BLE001
        # Retry once after clearing cache (in case session expired)
        _clear_cache()
        try:
            client = _get_client(payload)
            lessons = _lessons_for_week(client)
        except Exception as retry_exc:  # noqa: BLE001
            return {"ok": False, "error": f"Session Pronote expiree ou erreur : {retry_exc}"}

    # In QR mode the token rotates on every login - return the fresh one so it
    # is persisted. In password mode the credentials stay the same.
    return {
        "ok": True,
        "account_name": _account_name(client),
        "username": client.username,
        "password": client.password,
        "lessons": lessons,
    }


def _french_date_label(date_str: str) -> str:
    """Turn '01/05/2025 09:00:00' into 'Vendredi 01 mai' style label."""
    import datetime as dt
    jours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
    mois = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
    try:
        core = (date_str or "").split()[0]
        d = dt.datetime.strptime(core, "%d/%m/%Y").date()
        return f"{jours[d.weekday()]} {d.day:02d} {mois[d.month-1]}"
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
    if date_debut:
        try:
            s = str(date_debut).strip()
            if "-" in s and len(s) >= 10:
                d0 = dt.datetime.strptime(s[:10], "%Y-%m-%d").date()
            else:
                core = s.split()[0] if " " in s else s
                d0 = dt.datetime.strptime(core, "%d/%m/%Y").date()
            first_w = client.get_week(d0)
        except Exception:  # noqa: BLE001
            first_w = client.get_week(today - dt.timedelta(days=days_back))
    else:
        first_w = client.get_week(today - dt.timedelta(days=days_back))

    last_w = client.get_week(today + dt.timedelta(days=28))

    first_w = max(0, first_w)
    last_w = max(0, last_w)
    if first_w > last_w:
        first_w = last_w

    items = []
    seen = set()

    # Try querying the entire range in a single request first (extremely fast!)
    lst = None
    try:
        data = {"domaine": {"_T": 8, "V": f"[{first_w}..{last_w}]"}}
        if classe:
            data["ressource"] = classe
            data["classe"] = classe
            data["estCours"] = True
            data["avecCoursAnnules"] = True
        resp = client.post("PageCahierDeTexte", 89, data)
        lst = (
            resp.get("dataSec", {})
            .get("data", {})
            .get("ListeCahierDeTextes", {})
            .get("V", [])
        )
    except Exception:  # noqa: BLE001
        lst = None

    # Fallback to week-by-week loop if range query failed or returned nothing
    if not lst:
        lst = []
        for w in range(first_w, last_w + 1):
            try:
                data = {"domaine": {"_T": 8, "V": f"[{w}..{w}]"}}
                if classe:
                    data["ressource"] = classe
                    data["classe"] = classe
                    data["estCours"] = True
                    data["avecCoursAnnules"] = True
                resp = client.post("PageCahierDeTexte", 89, data)
                sub_lst = (
                    resp.get("dataSec", {})
                    .get("data", {})
                    .get("ListeCahierDeTextes", {})
                    .get("V", [])
                )
                if sub_lst:
                    lst.extend(sub_lst)
            except Exception:  # noqa: BLE001
                continue

    for e in lst:
        conts = (e.get("listeContenus") or {}).get("V") or []
        if not conts:
            continue
        c = conts[0]
        mat = (e.get("Matiere") or {}).get("V") or {}
        subject = mat.get("L") or ""
        groups = [
            (g or {}).get("L", "")
            for g in ((e.get("listeGroupes") or {}).get("V") or [])
        ]
        profs = [
            (p or {}).get("L", "")
            for p in ((e.get("listeProfesseurs") or {}).get("V") or [])
        ]
        title = c.get("L") or ""
        raw_desc = ((c.get("descriptif") or {}).get("V") or "")
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
                        documents.append({
                            "name": att.name,
                            "id": att.id,
                            "type": att.type,  # 0 = link, 1 = file
                            "url": att.url,
                            "estUnLienInterne": pj.get("estUnLienInterne", False),
                        })
                    else:
                        documents.append({
                            "name": pj.get("L", ""),
                            "id": pj.get("N", ""),
                            "type": pj.get("G", 1),
                            "url": "",
                            "estUnLienInterne": pj.get("estUnLienInterne", False),
                        })
                except Exception:  # noqa: BLE001
                    documents.append({
                        "name": pj.get("L", ""),
                        "id": pj.get("N", ""),
                        "type": pj.get("G", 1),
                        "url": "",
                        "estUnLienInterne": pj.get("estUnLienInterne", False),
                    })
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
    import json as json_mod

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
                                            documents.append({
                                                "name": getattr(f, "name", ""),
                                                "id": getattr(f, "id", ""),
                                                "type": getattr(f, "type", 0),
                                                "url": getattr(f, "url", ""),
                                            })
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
                            documents.append({
                                "name": getattr(f, "name", ""),
                                "id": getattr(f, "id", ""),
                                "type": getattr(f, "type", 0),
                                "url": getattr(f, "url", ""),
                            })
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
        import pronotepy
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
        client.parametres_utilisateur.get("dataSec", {})
        .get("data", {})
        .get("listeClasses", {})
        .get("V", [])
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

    # Return fresh token so caller can persist (like sync) + extra context
    return {
        "ok": True,
        "username": client.username,
        "password": client.password,
        "account_name": _account_name(client),
        "contents": filtered,
        "matieres": matieres,
        "classe_used": classe_dict,
    }


def pronote_classes(payload):
    """Return the list of classes (listeClasses) for the logged-in prof/teacher account.
    Used to populate dropdowns instead of free-text class names.
    """
    try:
        import pronotepy
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

    classes_raw = (
        client.parametres_utilisateur.get("dataSec", {})
        .get("data", {})
        .get("listeClasses", {})
        .get("V", [])
    )
    classes = []
    for c in classes_raw:
        name = (c.get("L") or "").strip()
        # Filter out subgroups, options, or admin codes.
        # Main classes have no space, dot, parenthesis, or comma, and length <= 6.
        if (
            name
            and len(name) <= 6
            and not any(char in name for char in [" ", ".", "(", ")", ","])
        ):
            classes.append({
                "name": name,
                "N": c.get("N"),
                "G": c.get("G", 1),
            })

    return {
        "ok": True,
        "classes": classes,
        "account_name": _account_name(client),
        "username": client.username,
        "password": client.password,
    }


# ---------------------------------------------------------------------------

COMMANDS = {
    "run_demo": run_demo,
    "extract_pdf": extract_pdf,
    "python_complete": python_complete,
    "pronote_login": pronote_login,
    "pronote_password_login": pronote_password_login,
    "pronote_sync": pronote_sync,
    "pronote_contents": pronote_contents,
    "pronote_classes": pronote_classes,
}


def preload_heavy_modules():
    """Pre-import heavy deps at sidecar startup so first real call is fast.
    This is key for "keep warm" + snappy on low-end systems.
    """
    for name in ("pronotepy", "jedi", "pypdf"):
        try:
            __import__(name)
        except Exception:
            pass  # will fail later in the handler with clear error


def server_mode():
    """Interactive server: read JSON command lines from stdin, write one response line per command.
    Keeps the Python process alive ("warm") for the lifetime of the app.
    """
    preload_heavy_modules()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            command = data.get("command") or data.get("cmd", "")
            payload = data.get("payload", data.get("data", {}))
            handler = COMMANDS.get(command)
            if handler is None:
                resp = {"ok": False, "error": f"Commande inconnue : {command}"}
            else:
                resp = handler(payload)
            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()
        except Exception as exc:  # noqa: BLE001
            sys.stdout.write(json.dumps({"ok": False, "error": f"Erreur sidecar : {exc}"}) + "\n")
            sys.stdout.flush()
    # EOF or parent died -> graceful exit


def main():
    # New persistent warm mode (preferred, used by built app):
    #   sidecar is started once, communicates over stdio JSON lines.
    # Legacy one-shot (for direct terminal use or during transition):
    #   sidecar <command> <json-payload-as-string>
    if len(sys.argv) >= 3:
        # legacy one-shot
        command = sys.argv[1]
        raw = sys.argv[2]
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {}

        handler = COMMANDS.get(command)
        if handler is None:
            reply({"ok": False, "error": f"Commande inconnue : {command}"})
            return
        try:
            reply(handler(payload))
        except Exception as exc:  # noqa: BLE001
            reply({"ok": False, "error": f"Erreur sidecar : {exc}"})
    else:
        server_mode()


if __name__ == "__main__":
    main()
