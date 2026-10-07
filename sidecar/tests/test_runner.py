"""A student script runs in its own process and talks to Euclide in events.

Run from sidecar/: python -m unittest discover -s tests -t .
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SIDECAR = Path(__file__).resolve().parents[1]


def run(code, *, inputs=(), checks=None, cwd=None, close_stdin=False):
    """All events of one run, answering input() from `inputs`."""
    with subprocess.Popen(
        [sys.executable, "-m", "euclide_sidecar", "--run"],
        cwd=SIDECAR,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
    ) as proc:
        start = {"code": code, "name": "essai.py", "cwd": cwd, "checks": checks}
        proc.stdin.write(json.dumps(start) + "\n")
        proc.stdin.flush()
        answers = list(inputs)
        events = []
        for line in proc.stdout:
            event = json.loads(line)
            events.append(event)
            if event["t"] == "input":
                if close_stdin or not answers:
                    proc.stdin.close()
                else:
                    proc.stdin.write(json.dumps({"t": "input", "s": answers.pop(0)}) + "\n")
                    proc.stdin.flush()
        proc.wait(timeout=30)
    return events


def text(events, kind="out"):
    return "".join(e["s"] for e in events if e["t"] == kind)


def done(events):
    return events[-1]


class Output(unittest.TestCase):
    def test_print_keeps_accents_and_order(self):
        events = run('print("é", 1 + 1)\nprint("fin")\n')
        self.assertEqual(text(events), "é 2\nfin\n")
        self.assertEqual(done(events), {"t": "done", "ok": True, "code": None})

    def test_stray_writes_to_the_real_stdout_do_not_break_the_protocol(self):
        events = run('import os\nos.write(1, b"brut\\n")\nprint("ok")\n')
        self.assertEqual(text(events), "ok\n")


class Input(unittest.TestCase):
    def test_input_asks_euclide_and_returns_the_answer(self):
        events = run('n = input("Nom ? ")\nprint("Bonjour", n)\n', inputs=["Élise"])
        self.assertIn({"t": "input", "prompt": "Nom ? "}, events)
        self.assertEqual(text(events), "Bonjour Élise\n")

    def test_closed_input_ends_the_script_with_eoferror(self):
        events = run('input("? ")\nprint("jamais")\n', close_stdin=True)
        self.assertFalse(done(events)["ok"])
        self.assertIn("EOFError", text(events, "err"))
        self.assertNotIn("jamais", text(events))


class Endings(unittest.TestCase):
    def test_exit_code_is_reported(self):
        events = run('print("é")\nexit(3)\n')
        self.assertEqual(done(events), {"t": "done", "ok": False, "code": 3})
        self.assertIn("code 3", text(events, "err"))

    def test_plain_exit_is_success(self):
        self.assertTrue(done(run("raise SystemExit\n"))["ok"])

    def test_traceback_shows_the_script_not_the_runner(self):
        events = run("def f(x):\n    return 1 / x\n\nf(0)\n")
        err = text(events, "err")
        self.assertIn("ZeroDivisionError", err)
        self.assertIn('File "essai.py", line 2', err)
        self.assertIn("return 1 / x", err)
        self.assertNotIn("runner.py", err)

    def test_syntax_error_points_at_the_line(self):
        err = text(run("x = (1,\n"), "err")
        self.assertIn("SyntaxError", err)

    def test_numpy_explains_itself_in_french(self):
        err = text(run("import numpy as np\n"), "err")
        self.assertIn("n'est pas disponible dans Euclide", err)


class Shims(unittest.TestCase):
    def test_turtle_draws_lines(self):
        events = run("import turtle\nt = turtle.Turtle()\nt.forward(100)\nt.left(90)\nt.forward(50)\n")
        ops = [op for e in events if e["t"] == "turtle" for op in e["ops"]]
        lines = [op for op in ops if op["op"] == "line"]
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0]["from"], [0.0, 0.0])
        self.assertAlmostEqual(lines[1]["to"][0], 100.0)
        self.assertAlmostEqual(lines[1]["to"][1], 50.0)

    def test_turtle_module_functions_and_colours(self):
        code = (
            "from turtle import *\ncolormode(255)\ncolor((255, 0, 0))\nbegin_fill()\ncircle(20)\nend_fill()\n"
        )
        ops = [op for e in run(code) if e["t"] == "turtle" for op in e["ops"]]
        fills = [op for op in ops if op["op"] == "fill"]
        self.assertEqual(len(fills), 1)
        self.assertEqual(fills[0]["color"], "rgb(255,0,0)")

    def test_pyplot_shows_svg_even_without_show(self):
        code = (
            'import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [1, 4, 9], label="<carré>")\nplt.legend()\n'
        )
        plots = [e for e in run(code) if e["t"] == "plot"]
        self.assertEqual(len(plots), 1)
        self.assertTrue(plots[0]["svg"].startswith("<svg"))
        self.assertIn("&lt;carré&gt;", plots[0]["svg"])

    def test_scripts_can_read_files_next_to_them(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "notes.csv").write_text("12\n15\n", encoding="utf-8")
            code = "print(sum(int(x) for x in open('notes.csv')))\n"
            self.assertEqual(text(run(code, cwd=tmp)), "27\n")


class Checks(unittest.TestCase):
    def checks(self, events):
        return [e for e in events if e["t"] == "check"]

    def test_companion_file_with_egal_and_bare_assert(self):
        script = "def carre(x):\n    return x * x\n"
        source = (
            "def test_positif():\n    egal(carre(3), 9)\n\n"
            "def test_negatif():\n    egal(carre(-2), 5)\n\n"
            "def test_zero():\n    assert carre(0) == 1\n"
        )
        results = self.checks(run(script, checks={"source": source}))
        self.assertEqual([r["ok"] for r in results], [True, False, False])
        self.assertEqual(results[1]["message"], "attendu 5, obtenu 4")
        self.assertIn("assert carre(0) == 1", results[2]["message"])

    def test_doctests_when_there_is_no_companion_file(self):
        script = 'def double(x):\n    """\n    >>> double(2)\n    4\n    >>> double(5)\n    11\n    """\n    return 2 * x\n'
        results = self.checks(run(script, checks={"source": ""}))
        self.assertEqual(len(results), 1)
        self.assertFalse(results[0]["ok"])
        self.assertIn("attendu '11', obtenu '10'", results[0]["message"])

    def test_no_checks_when_the_script_fails(self):
        results = self.checks(run("1 / 0\n", checks={"source": "def test_a():\n    pass\n"}))
        self.assertEqual(results, [])


if __name__ == "__main__":
    unittest.main()
