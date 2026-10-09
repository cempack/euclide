"""A class's students: found by the class's name, names only, and the turned
token handed back whatever happens.

Run from sidecar/: python -m unittest discover -s tests -t .
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest import mock

from euclide_sidecar import pronote

ENTRIES = [
    {"L": "DUPONT Léa", "N": "1", "nom": "DUPONT", "prenoms": "Léa"},
    {"L": "MARTIN Hugo", "N": "2", "nom": "MARTIN", "prenoms": "Hugo  Jean"},
    # No first and last name apart: the full name, as Pronote writes it.
    {"L": "BERNARD Zoé", "N": "3"},
    {"N": "4"},
]


class FakeClient:
    username = "login-2"
    password = "token-2"
    pronote_url = "https://x/pronote/mobile.professeur.html"
    uuid = "device"
    login_mode = "token"
    client_identifier = ""

    def __init__(self, entries=None, fail=False):
        self.parametres_utilisateur = {
            "dataSec": {"data": {"listeClasses": {"V": [{"L": "2NDE7", "N": "C7"}, {"L": "1G3", "N": "C3"}]}}}
        }
        self.current_period = SimpleNamespace(id="P2")
        self.info = SimpleNamespace(name="M. PROF")
        self.entries = ENTRIES if entries is None else entries
        self.fail = fail
        self.posted = []

    def post(self, function, onglet, data):
        self.posted.append((function, onglet, data))
        if self.fail:
            raise RuntimeError("accès refusé")
        return {"dataSec": {"data": {"listeRessources": {"V": self.entries}}}}


class PronoteStudents(unittest.TestCase):
    def run_with(self, client, class_name):
        with mock.patch.object(pronote, "_get_client", return_value=client):
            return pronote.pronote_students({"class": class_name})

    def test_names_of_the_class_in_its_order(self):
        client = FakeClient()
        res = self.run_with(client, " 2nde7 ")
        self.assertTrue(res["ok"], res)
        self.assertEqual(res["class"], "2NDE7")
        self.assertEqual(res["names"], ["Léa DUPONT", "Hugo Jean MARTIN", "BERNARD Zoé"])
        self.assertEqual(
            client.posted,
            [("ListeRessources", 105, {"classe": {"N": "C7", "G": 1}, "periode": {"N": "P2", "G": 1}})],
        )
        self.assertEqual(res["password"], "token-2")

    def test_an_unknown_class_says_so_and_keeps_the_token(self):
        res = self.run_with(FakeClient(), "TG2")
        self.assertFalse(res["ok"])
        self.assertIn("TG2", res["error"])
        self.assertEqual((res["username"], res["password"]), ("login-2", "token-2"))

    def test_a_refusal_says_so_and_keeps_the_token(self):
        res = self.run_with(FakeClient(fail=True), "1G3")
        self.assertFalse(res["ok"])
        self.assertIn("accès refusé", res["error"])
        self.assertEqual(res["password"], "token-2")

    def test_no_class_no_call(self):
        with mock.patch.object(pronote, "_get_client") as get:
            res = pronote.pronote_students({"class": "  "})
        self.assertFalse(res["ok"])
        get.assert_not_called()


if __name__ == "__main__":
    unittest.main()
