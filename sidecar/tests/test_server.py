"""The warm server's envelope, and the protocol channel.

Run from sidecar/: python -m unittest discover -s tests -t .
"""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

from euclide_sidecar import protocol, server

SIDECAR = Path(__file__).resolve().parents[1]


class Envelope(unittest.TestCase):
    def test_hello_gives_the_protocol(self):
        self.assertEqual(
            server.handle({}, {"id": 1, "cmd": "hello"}),
            {"id": 1, "ok": True, "result": {"protocol": protocol.PROTOCOL}},
        )

    def test_unknown_command(self):
        reply = server.handle({}, {"id": 2, "cmd": "nope"})
        self.assertFalse(reply["ok"])
        self.assertIn("nope", reply["error"])

    def test_handler_errors_become_messages(self):
        def boom(_payload):
            raise ValueError("cassé")

        reply = server.handle({"boom": boom}, {"id": 3, "cmd": "boom"})
        self.assertEqual(reply["id"], 3)
        self.assertIn("cassé", reply["error"])

    def test_ok_false_results_are_errors_with_their_text(self):
        reply = server.handle({"f": lambda _p: {"ok": False, "error": "PIN requis"}}, {"id": 4, "cmd": "f"})
        self.assertEqual(reply["error"], "PIN requis")
        self.assertFalse(reply["ok"])


class Process(unittest.TestCase):
    def test_lane_answers_in_order_and_ignores_noise(self):
        requests = "".join(
            json.dumps(m) + "\n"
            for m in (
                {"id": 1, "cmd": "hello"},
                "pas du json",
                {"id": 2, "cmd": "extract_pdf", "payload": {"path": ""}},
            )
        )
        proc = subprocess.run(
            [sys.executable, "-m", "euclide_sidecar", "--lane", "tools"],
            cwd=SIDECAR,
            input=requests,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=60,
        )
        replies = [json.loads(line) for line in proc.stdout.splitlines()]
        self.assertEqual([r.get("id") for r in replies], [1, None, 2])
        self.assertEqual(replies[0]["result"]["protocol"], protocol.PROTOCOL)
        self.assertEqual(replies[2]["result"], {"text": ""})


if __name__ == "__main__":
    unittest.main()
