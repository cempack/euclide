"""The editor's completions (Jedi) and the text of PDFs for the search index."""


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


# Pages read for the search: a long textbook stays within the lane's minute.
MAX_PAGES = 300


def extract_pdf(payload):
    """A PDF's text for the search, a form feed between pages: the search
    counts them to say on which page a word is (commands/search.rs)."""
    path = payload.get("path")
    if not path:
        return {"text": ""}
    try:
        from pypdf import PdfReader

        reader = PdfReader(path)
        pages = []
        for page in reader.pages[:MAX_PAGES]:
            try:
                text = page.extract_text() or ""
            except Exception:  # noqa: BLE001
                text = ""
            # A page keeps its place, read or not.
            pages.append(text.replace("\f", " "))
        return {"text": "\f".join(pages)}
    except Exception as exc:  # noqa: BLE001
        return {"text": "", "error": str(exc)}
