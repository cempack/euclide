"""Every script template Euclide offers (src/features/python/templates/)
runs as it is: no error, its drawing or its figure, and its examples pass,
except the exercise's, which wait to be completed.

Run from sidecar/: python -m unittest discover -s tests -t .
"""

from __future__ import annotations

import unittest
from pathlib import Path

from tests.test_runner import done, run, text

TEMPLATES = Path(__file__).resolve().parents[2] / "src" / "features" / "python" / "templates"

# What a template asks with input(), answered in order.
INPUTS = {"saisie-et-calcul": ["100", "20"]}
DRAWS = {"polygones", "rosace"}
PLOTS = {"courbe", "lancers-de-de"}
EXERCISES = {"fonction-a-completer"}


class Templates(unittest.TestCase):
    def test_there_are_templates(self):
        self.assertGreaterEqual(len(list(TEMPLATES.glob("*.py"))), 10)

    def test_each_runs_and_passes_its_examples(self):
        for path in sorted(TEMPLATES.glob("*.py")):
            stem = path.stem
            code = path.read_text(encoding="utf-8")
            with self.subTest(template=stem):
                checks = {"source": ""} if ">>>" in code else None
                events = run(code, inputs=INPUTS.get(stem, ()), checks=checks)
                self.assertTrue(done(events)["ok"], text(events, "err"))
                self.assertEqual(text(events, "err"), "")
                if stem in DRAWS:
                    self.assertTrue(any(e["t"] == "turtle" for e in events), "no drawing")
                if stem in PLOTS:
                    self.assertTrue(any(e["t"] == "plot" for e in events), "no figure")
                results = [e for e in events if e["t"] == "check"]
                if checks is None:
                    self.assertEqual(results, [])
                elif stem in EXERCISES:
                    self.assertTrue(
                        results and not all(r["ok"] for r in results), "the exercise is already solved"
                    )
                else:
                    self.assertTrue(results)
                    self.assertTrue(all(r["ok"] for r in results), results)

    def test_the_input_template_answers(self):
        code = (TEMPLATES / "saisie-et-calcul.py").read_text(encoding="utf-8")
        self.assertIn("Prix TTC : 120.00 €", text(run(code, inputs=["100", "20"])))


if __name__ == "__main__":
    unittest.main()
