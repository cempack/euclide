"""Smoke test of the frozen sidecar, the one school PCs run.

    python sidecar/smoke_frozen.py sidecar/dist/euclide-sidecar/euclide-sidecar[.exe]

Checks what freezing can break: the handshake, Jedi's data, accents through
the pipes, input(), exit codes, the standard modules a lesson imports, the
shims, and that an endless loop can be killed.
"""

import json
import subprocess
import sys
import time

PROTOCOL = 2


def lane(binary, name, requests):
    proc = subprocess.run(
        [binary, "--lane", name],
        input="".join(json.dumps(r) + "\n" for r in requests),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
    )
    return [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]


def run(binary, code, answers=()):
    proc = subprocess.Popen(
        [binary, "--run"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
    )
    proc.stdin.write(json.dumps({"code": code, "name": "smoke.py", "cwd": None, "checks": None}) + "\n")
    proc.stdin.flush()
    answers = list(answers)
    events = []
    for line in proc.stdout:
        event = json.loads(line)
        events.append(event)
        if event["t"] == "input":
            proc.stdin.write(json.dumps({"t": "input", "s": answers.pop(0)}) + "\n")
            proc.stdin.flush()
    proc.wait(timeout=60)
    proc.stdin.close()
    proc.stdout.close()
    return events


def out(events, kind="out"):
    return "".join(e["s"] for e in events if e["t"] == kind)


def check(name, ok, detail=""):
    print(("ok   " if ok else "FAIL ") + name + (f" — {detail}" if detail and not ok else ""))
    return ok


def main(binary):
    results = []

    replies = lane(
        binary,
        "tools",
        [
            {"id": 0, "cmd": "hello"},
            {
                "id": 1,
                "cmd": "python_complete",
                "payload": {"code": "import math\nmath.sq", "line": 2, "column": 7},
            },
        ],
    )
    results.append(check("handshake", replies[0]["result"]["protocol"] == PROTOCOL, str(replies[0])))
    names = [c["name"] for c in replies[1].get("result", {}).get("completions", [])]
    results.append(check("jedi completes math.sqrt", "sqrt" in names, str(replies[1])[:200]))

    replies = lane(binary, "index", [{"id": 1, "cmd": "extract_pdf", "payload": {"path": ""}}])
    results.append(check("index lane", replies[0].get("result") == {"text": ""}, str(replies)))

    events = run(binary, 'print("é", 6 * 7)\nn = input("Nom ? ")\nprint("Bonjour", n)\n', ["Élise"])
    results.append(check("accents and input()", out(events) == "é 42\nBonjour Élise\n", repr(out(events))))

    events = run(binary, "exit(3)\n")
    results.append(check("exit(3)", events[-1] == {"t": "done", "ok": False, "code": 3}, str(events[-1])))

    code = (
        "import statistics, fractions, decimal, random, csv, json, datetime, itertools, collections\n"
        "print(statistics.mean([1, 2, 3]), fractions.Fraction(1, 3) + fractions.Fraction(1, 6))\n"
    )
    events = run(binary, code)
    results.append(check("lesson modules", out(events) == "2 1/2\n", out(events) + out(events, "err")))

    code = "import turtle, matplotlib.pyplot as plt\nturtle.forward(10)\nplt.plot([1, 2])\nplt.show()\n"
    kinds = {e["t"] for e in run(binary, code)}
    results.append(check("turtle and pyplot shims", {"turtle", "plot"} <= kinds, str(kinds)))

    err = out(run(binary, "import numpy\n"), "err")
    results.append(check("numpy explains itself", "pas disponible dans Euclide" in err, err[-200:]))

    proc = subprocess.Popen([binary, "--run"], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, text=True)
    proc.stdin.write(json.dumps({"code": "while True:\n    pass\n", "name": "boucle.py"}) + "\n")
    proc.stdin.flush()
    time.sleep(1)
    proc.kill()
    try:
        proc.wait(timeout=5)
        killed = True
    except subprocess.TimeoutExpired:
        killed = False
    proc.stdin.close()
    results.append(check("endless loop can be killed", killed))

    if not all(results):
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1])
