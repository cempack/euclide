"""Login helpers: URL shape, stale device id, and human errors.

Run: python3 sidecar/test_pronote_login.py
"""

from __future__ import annotations

import importlib.util
import sys
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


class PronoteLoginHelpers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = load_sidecar()

    def test_normalize_adds_professeur_page(self):
        n = self.s._normalize_pronote_url
        self.assertEqual(
            n("https://demo.index-education.net/pronote/"),
            "https://demo.index-education.net/pronote/professeur.html",
        )
        self.assertEqual(
            n("https://demo.index-education.net/pronote"),
            "https://demo.index-education.net/pronote/professeur.html",
        )
        self.assertEqual(
            n("demo.index-education.net/pronote"),
            "https://demo.index-education.net/pronote/professeur.html",
        )

    def test_normalize_keeps_explicit_page(self):
        n = self.s._normalize_pronote_url
        self.assertEqual(
            n("https://demo.index-education.net/pronote/eleve.html?login=true"),
            "https://demo.index-education.net/pronote/eleve.html?login=true",
        )
        self.assertEqual(
            n("https://demo.index-education.net/pronote/professeur.html"),
            "https://demo.index-education.net/pronote/professeur.html",
        )

    def test_kwargs_omit_device_unless_pin(self):
        kw = self.s._password_login_kwargs
        self.assertEqual(kw(None, "Euclide-abc", None), {})
        self.assertEqual(
            kw("1234", "Euclide-abc", None),
            {"account_pin": "1234", "device_name": "Euclide-abc"},
        )
        self.assertEqual(
            kw(None, "Euclide-abc", "CID"),
            {"client_identifier": "CID"},
        )

    def test_crypto_error_is_detected(self):
        exc = (
            "Decryption failed while trying to un pad. (probably bad decryption key/iv)",
            "exception happened during login -> probably bad username/password",
        )
        self.assertTrue(self.s._is_login_crypto_error(exc))
        self.assertFalse(self.s._is_login_crypto_error("timeout"))

    def test_crypto_error_without_pin_asks_for_pin(self):
        exc = (
            "Decryption failed while trying to un pad. (probably bad decryption key/iv)",
            "exception happened during login -> probably bad username/password",
        )
        payload = self.s._login_error_payload(exc, offered_pin=False)
        self.assertFalse(payload["ok"])
        self.assertTrue(payload["needs_pin"])
        self.assertTrue(payload["error"].startswith("NEEDS_PIN:"))
        self.assertNotIn("un pad", payload["error"].lower())
        self.assertNotIn("Decryption", payload["error"])


if __name__ == "__main__":
    unittest.main()
