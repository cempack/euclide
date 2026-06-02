#!/usr/bin/env python3
"""Euclide sidecar.

Owns the fragile/heavy work that is awkward in Rust:
  - Pronote (pronotepy) QR-code and token login + schedule sync
  - PDF text extraction for the document search index
  - Running small Python teaching demos

Protocol: invoked as `euclide_sidecar.py <command> <json-payload>`. Prints exactly
one JSON line to stdout. All errors are reported as JSON, never as a crash, so
the Rust side can always parse a response.

Bundled for distribution with PyInstaller into a single `euclide-sidecar` binary so
no system Python is required on school machines.
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
    if not all([url, username, password]):
        return {"ok": False, "error": "URL, identifiant et mot de passe requis."}

    try:
        client = pronotepy.Client(url, username, password)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Connexion refusee : {exc}"}

    if not getattr(client, "logged_in", False):
        return {"ok": False, "error": "Identifiants invalides."}

    return {
        "ok": True,
        "mode": "password",
        "account_name": _account_name(client),
        "url": url,
        "username": username,
        "password": password,
    }


def pronote_sync(payload):
    try:
        import pronotepy
    except ImportError:
        return {"ok": False, "error": "pronotepy n'est pas installe dans le sidecar."}

    mode = payload.get("mode") or "qr"
    url = payload.get("url")
    username = payload.get("username")
    password = payload.get("password")
    uuid = str(payload.get("uuid", ""))
    if not all([url, username, password]):
        return {"ok": False, "error": "Identifiants Pronote incomplets."}

    try:
        if mode == "password":
            client = pronotepy.Client(url, username, password)
        else:
            client = pronotepy.Client.token_login(url, username, password, uuid)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Reconnexion impossible : {exc}"}

    if not getattr(client, "logged_in", False):
        return {"ok": False, "error": "Session Pronote expiree."}

    lessons = _lessons_for_week(client)
    # In QR mode the token rotates on every login - return the fresh one so it
    # is persisted. In password mode the credentials stay the same.
    return {
        "ok": True,
        "account_name": _account_name(client),
        "username": client.username,
        "password": client.password,
        "lessons": lessons,
    }


def _lesson_contents(client, days_back: int = 90):
    """Fetch 'contenu des cours' (lesson contents) from the cahier de textes over a recent period.
    Returns list of dicts with subject, groups, title, description, etc.
    Filtering by class/subject is done by caller if desired.
    """
    import datetime as dt

    today = dt.date.today()
    from_d = today - dt.timedelta(days=days_back)
    first_w = client.get_week(from_d)
    last_w = client.get_week(today + dt.timedelta(days=7))
    items = []
    seen = set()
    for w in range(first_w, last_w + 1):
        try:
            data = {"domaine": {"_T": 8, "V": f"[{w}..{w}]"}}
            resp = client.post("PageCahierDeTexte", 89, data)
            lst = (
                resp.get("dataSec", {})
                .get("data", {})
                .get("ListeCahierDeTextes", {})
                .get("V", [])
            )
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
                desc = ((c.get("descriptif") or {}).get("V") or "").strip()
                cat_obj = (c.get("categorie") or {}).get("V") or {}
                category = cat_obj.get("L") or ""
                date_str = (e.get("Date") or {}).get("V") or ""
                end_str = (e.get("DateFin") or {}).get("V") or ""
                lesson_n = ((e.get("cours") or {}).get("V") or {}).get("N") or ""
                key = (date_str, subject, title)
                if key in seen:
                    continue
                seen.add(key)
                items.append(
                    {
                        "date": date_str,
                        "end": end_str,
                        "subject": subject,
                        "groups": ", ".join([g for g in groups if g]),
                        "teachers": ", ".join([p for p in profs if p]),
                        "title": title,
                        "description": desc,
                        "category": category,
                        "lesson_id": lesson_n,
                    }
                )
        except Exception:  # noqa: BLE001
            continue

    # newest first
    items.sort(key=lambda x: x.get("date") or "", reverse=True)
    return items


def pronote_contents(payload):
    """Get lesson contents (le contenu des cours), optionally filtered by subject and class/group."""
    try:
        import pronotepy
    except ImportError:
        return {"ok": False, "error": "pronotepy n'est pas installe dans le sidecar."}

    mode = payload.get("mode") or "qr"
    url = payload.get("url")
    username = payload.get("username")
    password = payload.get("password")
    uuid = str(payload.get("uuid", ""))
    if not all([url, username, password]):
        return {"ok": False, "error": "Identifiants Pronote incomplets."}

    try:
        if mode == "password":
            client = pronotepy.Client(url, username, password)
        else:
            client = pronotepy.Client.token_login(url, username, password, uuid)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Reconnexion impossible : {exc}"}

    if not getattr(client, "logged_in", False):
        return {"ok": False, "error": "Session Pronote expiree."}

    subject = payload.get("subject")
    class_filter = payload.get("class") or payload.get("classe") or payload.get("group")

    all_contents = _lesson_contents(client)

    filtered = all_contents
    if subject:
        s_low = str(subject).lower().strip()
        filtered = [c for c in filtered if s_low in c.get("subject", "").lower()]
    if class_filter:
        c_low = str(class_filter).lower().strip()
        filtered = [
            c
            for c in filtered
            if c_low in c.get("groups", "").lower() or c_low in c.get("subject", "").lower()
        ]

    # Return fresh token so caller can persist (like sync)
    return {
        "ok": True,
        "username": client.username,
        "password": client.password,
        "contents": filtered,
    }


# ---------------------------------------------------------------------------

COMMANDS = {
    "run_demo": run_demo,
    "extract_pdf": extract_pdf,
    "pronote_login": pronote_login,
    "pronote_password_login": pronote_password_login,
    "pronote_sync": pronote_sync,
    "pronote_contents": pronote_contents,
}


def main():
    if len(sys.argv) < 2:
        reply({"ok": False, "error": "Commande manquante."})
        return
    command = sys.argv[1]
    raw = sys.argv[2] if len(sys.argv) > 2 else "{}"
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


if __name__ == "__main__":
    main()
