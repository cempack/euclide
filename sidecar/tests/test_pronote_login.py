"""Login helpers: URL shape, stale device id, human errors, and trading a
password for Pronote's token.

Run from sidecar/: python -m unittest discover -s tests -t .
"""

from __future__ import annotations

import unittest

from euclide_sidecar import pronote


class PronoteLoginHelpers(unittest.TestCase):
    s = pronote

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


class TokenSession:
    """What pronotepy's qrcode_login returns: a session on a rotating token."""

    logged_in = True
    username = "login-1"
    password = "token-1"
    login_mode = "token"
    pronote_url = "https://x/pronote/mobile.professeur.html?fd=1&login=true"
    uuid = "device-1"
    client_identifier = "cid"


class TokenTrade(unittest.TestCase):
    def setUp(self):
        pronote._token_refused = False

    def test_a_password_session_turns_into_a_token_session(self):
        seen = {}

        class Pronotepy:
            class Client:
                @staticmethod
                def qrcode_login(data, pin, uuid, account_pin=None, device_name=None):
                    seen["login"] = (data, pin, uuid, account_pin, device_name)
                    return TokenSession()

        class PasswordSession:
            def request_qr_code_data(self, pin):
                seen["pin"] = pin
                return {"url": "https://x/pronote/professeur.html", "jeton": "j", "login": "l"}

        token = pronote._trade_for_token(Pronotepy, PasswordSession(), "device-1", "1234", "Euclide-x")
        self.assertIsInstance(token, TokenSession)
        data, pin, uuid, account_pin, device_name = seen["login"]
        self.assertRegex(pin, r"^\d{4}$")
        self.assertEqual(pin, seen["pin"], "the QR code's own PIN unlocks it")
        self.assertEqual(data["jeton"], "j")
        self.assertEqual((uuid, account_pin, device_name), ("device-1", "1234", "Euclide-x"))
        reply = pronote._credentials_reply(token)
        self.assertEqual(
            reply,
            {
                "username": "login-1",
                "password": "token-1",
                "client_identifier": "cid",
                "token": True,
                "url": "https://x/pronote/mobile.professeur.html?fd=1&login=true",
                "uuid": "device-1",
            },
        )

    def test_an_establishment_without_qr_codes_is_asked_once(self):
        asked = []

        class PasswordSession:
            def request_qr_code_data(self, pin):
                asked.append(pin)
                return {"url": "https://demo/pronote/professeur.html"}  # the public demo's answer

        self.assertIsNone(pronote._trade_for_token(object, PasswordSession(), "device-1"))
        self.assertIsNone(pronote._trade_for_token(object, PasswordSession(), "device-1"))
        self.assertEqual(len(asked), 1)

    def test_no_trade_without_a_device_id(self):
        class PasswordSession:
            def request_qr_code_data(self, pin):
                raise AssertionError("not asked")

        self.assertIsNone(pronote._trade_for_token(object, PasswordSession(), ""))

    def test_a_password_session_says_it_is_no_token(self):
        class PasswordSession:
            logged_in = True
            username = "prof"
            password = "s3cret"
            login_mode = "normal"
            pronote_url = "https://x/pronote/professeur.html"
            uuid = ""

        self.assertFalse(pronote._credentials_reply(PasswordSession())["token"])


if __name__ == "__main__":
    unittest.main()
