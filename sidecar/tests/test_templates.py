"""Every script template Euclide offers (src/features/python/templates/,
one folder per level) runs as it is: no error, its drawing when it uses
turtle, its figure when it uses matplotlib, and its examples pass, except
the exercises', which wait to be completed.

Run from sidecar/: python -m unittest discover -s tests -t .
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

from tests.test_runner import done, run, text

TEMPLATES = Path(__file__).resolve().parents[2] / "src" / "features" / "python" / "templates"
HEADER = re.compile(r"\A# Modèle : .+\n# Résumé : .+\n(# Script : .+\n)?\n(?!\n)")

# What a template asks with input(), answered in order.
INPUTS = {"bases/saisie-et-calcul": ["100", "20"]}
# Exercises: their examples fail until the student completes them.
EXERCISES = {"bases/fonction-a-completer", "bases/fiche-d-exercices"}


def templates():
    return sorted(TEMPLATES.glob("*/*.py"))


def key(path):
    return f"{path.parent.name}/{path.stem}"


class Templates(unittest.TestCase):
    def test_there_are_templates_in_every_level(self):
        self.assertGreaterEqual(len(templates()), 14)
        self.assertEqual(list(TEMPLATES.glob("*.py")), [], "a template outside a level folder")

    def test_each_has_its_header(self):
        for path in templates():
            with self.subTest(template=key(path)):
                self.assertRegex(path.read_text(encoding="utf-8"), HEADER)

    def test_each_runs_and_passes_its_examples(self):
        for path in templates():
            code = path.read_text(encoding="utf-8")
            with self.subTest(template=key(path)):
                checks = {"source": ""} if ">>>" in code else None
                events = run(code, inputs=INPUTS.get(key(path), ()), checks=checks)
                self.assertTrue(done(events)["ok"], text(events, "err"))
                self.assertEqual(text(events, "err"), "")
                if re.search(r"^(from turtle import|import turtle)", code, re.M):
                    self.assertTrue(any(e["t"] == "turtle" for e in events), "no drawing")
                if "import matplotlib" in code:
                    self.assertTrue(any(e["t"] == "plot" for e in events), "no figure")
                results = [e for e in events if e["t"] == "check"]
                if checks is None:
                    self.assertEqual(results, [])
                elif key(path) in EXERCISES:
                    self.assertTrue(
                        results and not all(r["ok"] for r in results), "the exercise is already solved"
                    )
                else:
                    self.assertTrue(results)
                    self.assertTrue(all(r["ok"] for r in results), results)

    def test_the_input_template_answers(self):
        code = (TEMPLATES / "bases" / "saisie-et-calcul.py").read_text(encoding="utf-8")
        self.assertIn("Prix TTC : 120.00 €", text(run(code, inputs=["100", "20"])))


if __name__ == "__main__":
    unittest.main()
