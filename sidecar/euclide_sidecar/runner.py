"""Runs one student script, in a process of its own.

Euclide starts this process ahead of time (it waits, warm, for a script),
then sends one start message:

    {"code": "...", "name": "suite.py", "cwd": ".../python",
     "checks": {"source": "..." | ""} | null}   (null: no checks; "" source: doctests)

and reads events back, one JSON line each:

    {"t": "out", "s": "texte"}            printed text
    {"t": "err", "s": "texte"}            stderr text
    {"t": "input", "prompt": "Âge ? "}    input() waits for {"t": "input", "s": "..."}
    {"t": "turtle", "ops": [...]}         drawing (shims/turtle.py)
    {"t": "plot", "svg": "<svg…"}         a figure (shims/pyplot.py)
    {"t": "check", "name", "ok", "message"}
    {"t": "done", "ok": bool, "code": int | None}

Stopping, the time limit and the output cap are Euclide's job: it kills the
process. Nothing here can hang Euclide.
"""

import builtins
import linecache
import os
import sys
import time
import traceback

from . import protocol

_channel = None


def emit(message):
    _channel.send(message)


class _Stream:
    """sys.stdout / sys.stderr for the script: buffered, sent as events at
    each line end (or every 50 ms of continuous printing)."""

    def __init__(self, kind):
        self.kind = kind
        self.buffer = []
        self.size = 0
        self.last = time.monotonic()
        self.encoding = "utf-8"
        self.errors = "replace"

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError(f"write() attend du texte, pas {type(text).__name__}")
        if not text:
            return 0
        self.buffer.append(text)
        self.size += len(text)
        now = time.monotonic()
        if "\n" in text or self.size > 8192 or now - self.last > 0.05:
            self.flush()
        return len(text)

    def writelines(self, lines):
        for line in lines:
            self.write(line)

    def flush(self):
        if self.buffer:
            emit({"t": self.kind, "s": "".join(self.buffer)})
            self.buffer = []
            self.size = 0
        self.last = time.monotonic()

    def isatty(self):
        return False

    def fileno(self):
        raise OSError("pas de descripteur de fichier ici")

    @property
    def closed(self):
        return False

    def readable(self):
        return False

    def writable(self):
        return True


def _flush_all():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.flush()
        except Exception:  # noqa: BLE001
            pass


def _input(prompt=""):
    _flush_all()
    emit({"t": "input", "prompt": str(prompt)})
    message = protocol.read_message(_stdin)
    if message is None:
        raise EOFError("Plus de saisie possible : le script a été arrêté.")
    return str(message.get("s", message.get("raw", "")))


def _exit(code=None):
    raise SystemExit(code)


class _NoStdin:
    """sys.stdin for the script: input() is the way to ask for text."""

    def readline(self, *_):
        return _input() + "\n"

    def read(self, *_):
        return _input()

    def __iter__(self):
        return self

    def __next__(self):
        return self.readline()

    def isatty(self):
        return False


UNAVAILABLE = {
    "numpy": "numpy",
    "pandas": "pandas",
    "scipy": "scipy",
    "sympy": "sympy",
    "tkinter": "tkinter (les fenêtres)",
    "pygame": "pygame",
}


class _FriendlyMissing:
    """import numpy (and friends) explains itself in French."""

    def find_spec(self, name, path=None, target=None):
        root = name.split(".")[0]
        if root in UNAVAILABLE:
            raise ModuleNotFoundError(
                f"Le module {UNAVAILABLE[root]} n'est pas disponible dans Euclide. "
                "Les modules de base de Python (math, random, statistics…), turtle et "
                "matplotlib.pyplot (version simplifiée) sont disponibles.",
                name=name,
            )
        return None


def _install_shims():
    from .shims import pyplot, turtle

    sys.modules["turtle"] = turtle
    sys.modules["matplotlib.pyplot"] = pyplot
    matplotlib = type(sys)("matplotlib")
    matplotlib.pyplot = pyplot
    matplotlib.use = lambda *_args, **_kwargs: None
    matplotlib.__version__ = "euclide"
    sys.modules["matplotlib"] = matplotlib
    sys.meta_path.insert(0, _FriendlyMissing())


def _script_traceback(exc, name, cwd):
    """The traceback from the script's frames (and its own modules next to
    it): the runner's and the standard library's are noise."""
    te = traceback.TracebackException.from_exception(exc)
    frames = [f for f in te.stack if f.filename == name or (cwd and f.filename.startswith(cwd))]
    te.stack = traceback.StackSummary.from_list(frames)
    return "".join(te.format())


def _run_code(code, name, namespace, cwd):
    """True when the script ran to its end (or exit(0))."""
    try:
        exec(compile(code, name, "exec"), namespace)  # noqa: S102 - the teacher's own script
        return True, None
    except SystemExit as exc:
        status = exc.code
        if status is None or status == 0:
            return True, 0
        if isinstance(status, str):
            sys.stderr.write(status + "\n")
            return False, 1
        sys.stderr.write(f"Le script s'est arrêté (code {status}).\n")
        return False, status if isinstance(status, int) else 1
    except KeyboardInterrupt:
        return False, None
    except BaseException as exc:  # noqa: BLE001 - shown to the teacher as a traceback
        sys.stderr.write(_script_traceback(exc, name, cwd))
        return False, 1


def _run_checks(source, script_ns, script_name):
    from . import checks

    for result in checks.run(source, script_ns, script_name):
        _flush_all()
        emit({"t": "check", **result})


def main():
    global _channel, _stdin
    _channel = protocol.Channel()
    _stdin = sys.stdin
    # Warm: everything above is ready; wait for the script.
    start = protocol.read_message(_stdin)
    if not start or "code" not in start:
        return
    code = str(start.get("code") or "")
    name = str(start.get("name") or "script.py")
    cwd = start.get("cwd")
    if cwd and os.path.isdir(cwd):
        os.chdir(cwd)
        sys.path.insert(0, cwd)

    _install_shims()
    sys.stdout = _Stream("out")
    sys.stderr = _Stream("err")
    sys.stdin = _NoStdin()
    builtins.input = _input
    # exit() and quit() come from the `site` module, which a frozen Python
    # does not load: scripts use them all the same.
    builtins.exit = builtins.quit = _exit
    sys.argv = [name]
    namespace = {"__name__": "__main__", "__file__": name, "__builtins__": builtins}

    # Tracebacks quote the code as edited, not the file as last saved.
    linecache.cache[name] = (len(code), None, code.splitlines(True), name)
    ok, status = _run_code(code, name, namespace, cwd if cwd and os.path.isdir(cwd) else None)
    from .shims import pyplot, turtle

    # A drawing or a figure the script never « showed » is shown all the same.
    turtle.flush()
    if ok:
        pyplot.flush()
    wanted = start.get("checks")
    if ok and isinstance(wanted, dict):
        _run_checks(str(wanted.get("source") or ""), namespace, name)
    _flush_all()
    emit({"t": "done", "ok": ok, "code": status})


_stdin = None
