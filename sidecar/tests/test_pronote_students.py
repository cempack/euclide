"""A class's students: found by the class's name, names only, and the turned
token handed back whatever happens.

Run from sidecar/: python -m unittest discover -s tests -t .
"""

from __future__ import annotations

import datetime
import sys
import unittest
from types import ModuleType, SimpleNamespace
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
        classes = [{"L": "2NDE7", "N": "C7"}, {"L": "1G3", "N": "C3"}, {"L": "2NDE7 GR.A", "N": "G1"}]
        self.parametres_utilisateur = {"dataSec": {"data": {"listeClasses": {"V": classes}}}}
        self.current_period = SimpleNamespace(id="P2")
        self.info = SimpleNamespace(name="M. PROF")
        # One list for every class, or one per class's id.
        self.entries = ENTRIES if entries is None else entries
        # True for every class, or the ids Pronote refuses.
        self.fail = fail
        self.posted = []

    def post(self, function, onglet, data):
        self.posted.append((function, onglet, data))
        class_id = data["classe"]["N"]
        if self.fail is True or (self.fail and class_id in self.fail):
            raise RuntimeError("accès refusé")
        entries = self.entries.get(class_id, []) if isinstance(self.entries, dict) else self.entries
        return {"dataSec": {"data": {"listeRessources": {"V": entries}}}}


class TeacherClient(FakeClient):
    """A teacher's account, as Pronote's demo: pronotepy's current_period
    finds no « listeOngletsPourPeriodes » there; the year's periods are."""

    @property
    def current_period(self):
        raise KeyError("listeOngletsPourPeriodes")

    @current_period.setter
    def current_period(self, _value):
        pass

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        today = datetime.datetime.now()
        day = datetime.timedelta(days=1)
        self.periods = [
            SimpleNamespace(id="T0", start=today - 400 * day, end=today - 30 * day),
            SimpleNamespace(id="T1", start=today - 10 * day, end=today + 10 * day),
            SimpleNamespace(id="Y", start=today - 100 * day, end=today + 200 * day),
        ]


class PronoteStudents(unittest.TestCase):
    def run_with(self, client, class_name):
        # pronotepy only has to be there (CI installs none): the client is fake.
        with (
            mock.patch.dict(sys.modules, {"pronotepy": ModuleType("pronotepy")}),
            mock.patch.object(pronote, "_get_client", return_value=client),
        ):
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

    def test_a_teacher_account_asks_for_the_period_today_falls_in(self):
        client = TeacherClient()
        res = self.run_with(client, "2NDE7")
        self.assertTrue(res["ok"], res)
        self.assertEqual(client.posted[0][2]["periode"], {"N": "T1", "G": 1})

    def test_no_class_no_call(self):
        with (
            mock.patch.dict(sys.modules, {"pronotepy": ModuleType("pronotepy")}),
            mock.patch.object(pronote, "_get_client") as get,
        ):
            res = pronote.pronote_students({"class": "  "})
        self.assertFalse(res["ok"])
        get.assert_not_called()


class PronoteAllStudents(unittest.TestCase):
    """Every class at once: pronotepy's classes, then each one's students."""

    def run_with(self, client):
        with (
            mock.patch.dict(sys.modules, {"pronotepy": ModuleType("pronotepy")}),
            mock.patch.object(pronote, "_get_client", return_value=client),
        ):
            return pronote.pronote_all_students({})

    def test_each_class_with_its_names_and_no_group(self):
        client = FakeClient(entries={"C7": ENTRIES, "C3": ENTRIES[:1]})
        res = self.run_with(client)
        self.assertTrue(res["ok"], res)
        self.assertEqual(
            res["classes"],
            [
                {"class": "2NDE7", "names": ["Léa DUPONT", "Hugo Jean MARTIN", "BERNARD Zoé"]},
                {"class": "1G3", "names": ["Léa DUPONT"]},
            ],
        )
        self.assertEqual(res["failed"], [])
        # One request per class, in the current period; the group is not asked for.
        self.assertEqual([data["classe"]["N"] for _, _, data in client.posted], ["C7", "C3"])
        self.assertTrue(all(post[:2] == ("ListeRessources", 105) for post in client.posted))
        self.assertEqual(res["password"], "token-2")

    def test_a_refused_class_is_told_and_the_others_kept(self):
        res = self.run_with(FakeClient(fail={"C3"}))
        self.assertTrue(res["ok"], res)
        self.assertEqual([c["class"] for c in res["classes"]], ["2NDE7"])
        self.assertEqual(res["failed"], [{"class": "1G3", "error": "accès refusé"}])

    def test_a_class_without_students_is_left_out(self):
        res = self.run_with(FakeClient(entries={"C7": ENTRIES}))
        self.assertEqual([c["class"] for c in res["classes"]], ["2NDE7"])
        self.assertEqual(res["failed"], [])

    def test_a_teacher_account_loads_every_class(self):
        client = TeacherClient(entries={"C7": ENTRIES, "C3": ENTRIES[:1]})
        res = self.run_with(client)
        self.assertTrue(res["ok"], res)
        self.assertEqual([c["class"] for c in res["classes"]], ["2NDE7", "1G3"])
        self.assertTrue(all(data["periode"]["N"] == "T1" for _, _, data in client.posted))

    def test_no_session_says_so(self):
        with (
            mock.patch.dict(sys.modules, {"pronotepy": ModuleType("pronotepy")}),
            mock.patch.object(pronote, "_get_client", side_effect=RuntimeError("expirée")),
        ):
            res = pronote.pronote_all_students({})
        self.assertFalse(res["ok"])
        self.assertIn("expirée", res["error"])


if __name__ == "__main__":
    unittest.main()
