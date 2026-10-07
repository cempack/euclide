"""The private channel to Euclide.

The process's stdout belongs to the protocol: one JSON object per line. A
library (or a student script) that prints would corrupt it, so the channel
keeps its own copy of the file descriptor and everything Python-level that
writes to stdout is pointed at stderr instead.
"""

import json
import os
import sys

# Bumped whenever a message changes shape. Euclide refuses a sidecar that
# answers another number (a portable update that swapped only one of the two).
PROTOCOL = 2


def use_utf8_stdio():
    """Rust writes UTF-8. On Windows, Python would decode the pipes with the
    ANSI code page, mangling accented paths, names and passwords."""
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if stream is None:
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


class Channel:
    """Writes protocol messages, one JSON line each, on the saved stdout."""

    def __init__(self):
        sys.stdout.flush()
        fd = os.dup(1)
        # From here on, fd 1 (and so print(), and C extensions) is stderr.
        os.dup2(2, 1)
        self._out = os.fdopen(fd, "w", encoding="utf-8", newline="\n")
        sys.stdout = sys.stderr

    def send(self, message):
        self._out.write(json.dumps(message, ensure_ascii=False) + "\n")
        self._out.flush()


def read_message(stream=None):
    """The next JSON object from stdin, or None at end of input. A line that
    is not JSON is returned as {"raw": line}."""
    stream = stream or sys.stdin
    while True:
        line = stream.readline()
        if not line:
            return None
        line = line.strip()
        if not line:
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            return {"raw": line}
        return value if isinstance(value, dict) else {"raw": line}
