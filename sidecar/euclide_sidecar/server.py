"""The warm server: one process per lane (pronote, tools, index), kept
running, answering one request at a time.

Request:  {"id": 7, "cmd": "pronote_sync", "payload": {...}}
Response: {"id": 7, "ok": true, "result": {...}}
      or  {"id": 7, "ok": false, "error": "message en français", "result": {...}}

A handler returns a dict; one with "ok": false is an error, and its "error"
text is what the teacher sees.
"""

from . import protocol

# Imported only by the lane that needs them, the first time it does.
PRELOAD = {
    "pronote": ("pronotepy",),
    "tools": ("jedi",),
    "index": ("pypdf",),
}


def _handlers():
    from . import pronote, tools

    return {
        "extract_pdf": tools.extract_pdf,
        "python_complete": tools.python_complete,
        "pronote_login": pronote.pronote_login,
        "pronote_password_login": pronote.pronote_password_login,
        "pronote_sync": pronote.pronote_sync,
        "pronote_contents": pronote.pronote_contents,
        "pronote_classes": pronote.pronote_classes,
    }


def hello(_payload):
    return {"protocol": protocol.PROTOCOL}


def handle(handlers, message):
    """The response to one request (never raises)."""
    rid = message.get("id")
    # Before protocol 2 the command was under "command": an old Euclide
    # talking to this sidecar still gets a readable error.
    cmd = message.get("cmd") or message.get("command") or ""
    payload = message.get("payload")
    if not isinstance(payload, dict):
        payload = {}
    if cmd == "hello":
        return {"id": rid, "ok": True, "result": hello(payload)}
    handler = handlers.get(cmd)
    if handler is None:
        return {"id": rid, "ok": False, "error": f"Commande inconnue : {cmd}"}
    try:
        result = handler(payload)
    except (Exception, SystemExit) as exc:  # noqa: BLE001 - one bad request must not kill the lane
        return {"id": rid, "ok": False, "error": f"Erreur Python : {exc}"}
    if isinstance(result, dict) and result.get("ok") is False:
        return {"id": rid, "ok": False, "error": str(result.get("error") or "Erreur"), "result": result}
    return {"id": rid, "ok": True, "result": result}


def serve(lane):
    channel = protocol.Channel()
    for name in PRELOAD.get(lane, ()):
        try:
            __import__(name)
        except Exception:  # noqa: BLE001 - the handler reports it when used
            pass
    handlers = _handlers()
    while True:
        message = protocol.read_message()
        if message is None:
            return  # Euclide closed the pipe: quit quietly.
        channel.send(handle(handlers, message))
