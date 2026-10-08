"""Exercise checks, run after the script.

Two sources, as the teacher prefers:
  - a companion file `<script>.checks.py` whose `test_*` functions see the
    script's names (and `egal(obtenu, attendu)` for a readable failure);
  - otherwise the doctests of the script's own functions.

Each check gives {"name", "ok", "message"}; prints made during a check are
not shown (the console keeps the script's own output).
"""

import contextlib
import doctest
import io
import linecache
import traceback

CHECKS_NAME = "vérifications.py"


def egal(obtenu, attendu, message=""):
    """Fails with « attendu …, obtenu … » when the two differ."""
    if obtenu != attendu:
        prefix = f"{message} : " if message else ""
        raise AssertionError(f"{prefix}attendu {attendu!r}, obtenu {obtenu!r}")


def _title(name, func):
    doc = (getattr(func, "__doc__", None) or "").strip()
    if doc:
        return doc.splitlines()[0]
    return name.removeprefix("test_").replace("_", " ").strip() or name


def _failure(exc):
    if isinstance(exc, AssertionError):
        if str(exc):
            return str(exc)
        # A bare `assert x == 3`: show the line that failed.
        frame = traceback.extract_tb(exc.__traceback__)[-1]
        line = (frame.line or linecache.getline(frame.filename, frame.lineno)).strip()
        return f"échec : {line}" if line else "échec"
    return f"{type(exc).__name__} : {exc}"


def _checks_file(source, script_ns):
    ns = dict(script_ns)
    ns.update({"__name__": "verifications", "__file__": CHECKS_NAME, "egal": egal})
    linecache.cache[CHECKS_NAME] = (len(source), None, source.splitlines(True), CHECKS_NAME)
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            exec(compile(source, CHECKS_NAME, "exec"), ns)  # noqa: S102 - the teacher's own checks
    except BaseException as exc:  # noqa: BLE001
        yield {"name": "Fichier de vérifications", "ok": False, "message": _failure(exc)}
        return
    tests = [(k, v) for k, v in ns.items() if k.startswith("test_") and callable(v)]
    if not tests:
        yield {"name": "Fichier de vérifications", "ok": False, "message": "aucune fonction test_… trouvée"}
        return
    for name, func in tests:
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                func()
            yield {"name": _title(name, func), "ok": True, "message": ""}
        except BaseException as exc:  # noqa: BLE001
            yield {"name": _title(name, func), "ok": False, "message": _failure(exc)}


class _Collect(doctest.DocTestRunner):
    def __init__(self):
        super().__init__(verbose=False, optionflags=doctest.ELLIPSIS | doctest.NORMALIZE_WHITESPACE)
        self.problems = []

    def report_failure(self, out, test, example, got):
        # Both are already Python's own notation (12.0, 'Passable', [1, 2]).
        want = example.want.strip() or "rien"
        self.problems.append(f"{example.source.strip()} : attendu {want}, obtenu {got.strip() or 'rien'}")

    def report_unexpected_exception(self, out, test, example, exc_info):
        exc = exc_info[1]
        self.problems.append(f"{example.source.strip()} : {type(exc).__name__} : {exc}")


def _doctests(script_ns, script_name):
    """The examples of the script's functions, and of its classes (their
    docstring and their methods')."""
    for name, obj in list(script_ns.items()):
        code = getattr(obj, "__code__", None)
        if callable(obj) and code is not None and code.co_filename == script_name:
            finder = doctest.DocTestFinder(recurse=False)
        elif isinstance(obj, type) and obj.__module__ == script_ns.get("__name__"):
            finder = doctest.DocTestFinder(recurse=True)
        else:
            continue
        # module=False: the script is no module; every method is its own.
        for test in finder.find(obj, name, module=False, globs=dict(script_ns)):
            if not test.examples:
                continue
            runner = _Collect()
            runner.run(test, out=lambda _text: None, clear_globs=True)
            yield {"name": test.name, "ok": not runner.problems, "message": "\n".join(runner.problems)}


def run(source, script_ns, script_name):
    """The checks' results, in order. `source` is the companion file's text,
    or empty to use the script's doctests."""
    if source and source.strip():
        yield from _checks_file(source, script_ns)
        return
    found = False
    for result in _doctests(script_ns, script_name):
        found = True
        yield result
    if not found:
        yield {
            "name": "Vérifications",
            "ok": False,
            "message": "Aucune vérification : écrivez des exemples >>> dans les fonctions, "
            "ou un fichier « nom.checks.py » avec des fonctions test_….",
        }
