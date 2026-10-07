"""Student scripts must never take the sidecar down with them.

Run: python3 sidecar/test_run_demo.py
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SIDECAR = ROOT / "src-tauri" / "resources" / "euclide_sidecar.py"


def load_sidecar():
    spec = importlib.util.spec_from_file_location("euclide_sidecar", SIDECAR)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


class RunDemo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = load_sidecar()
        cls.tmp = tempfile.TemporaryDirectory()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def script(self, name: str, source: str) -> str:
        path = Path(self.tmp.name) / name
        path.write_text(source, encoding="utf-8")
        return str(path)

    def test_input_fails_fast_instead_of_reading_the_protocol_pipe(self):
        r = self.s.run_demo({"path": self.script("ask.py", 'n = input("Nombre ? ")\n')})
        self.assertFalse(r["ok"])
        self.assertIn("input()", r["stderr"])

    def test_exit_with_code_is_reported(self):
        r = self.s.run_demo({"path": self.script("exit3.py", 'print("é")\nexit(3)\n')})
        self.assertFalse(r["ok"])
        self.assertEqual(r["stdout"], "é\n")
        self.assertIn("code 3", r["stderr"])

    def test_plain_exit_is_success(self):
        r = self.s.run_demo({"path": self.script("exit0.py", 'print("ok")\nraise SystemExit\n')})
        self.assertTrue(r["ok"])
        self.assertEqual(r["stdout"], "ok\n")

    def test_stdin_is_restored(self):
        before = sys.stdin
        self.s.run_demo({"path": self.script("noop.py", "x = 1\n")})
        self.assertIs(sys.stdin, before)

    def test_server_keeps_answering_after_a_script_exits(self):
        first = self.script("first.py", "exit(2)\n")
        second = self.script("second.py", 'print("encore là")\n')
        requests = "".join(
            json.dumps({"command": "run_demo", "payload": {"path": p}}) + "\n" for p in (first, second)
        )
        proc = subprocess.run(
            [sys.executable, str(SIDECAR)],
            input=requests.encode("utf-8"),
            capture_output=True,
            timeout=120,
        )
        lines = [json.loads(line) for line in proc.stdout.decode("utf-8").splitlines() if line.strip()]
        self.assertEqual(len(lines), 2)
        self.assertFalse(lines[0]["ok"])
        self.assertTrue(lines[1]["ok"])
        self.assertEqual(lines[1]["stdout"], "encore là\n")


if __name__ == "__main__":
    unittest.main()
