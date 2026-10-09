import os
import tempfile
import unittest

from euclide_sidecar import tools


def write_pdf(path, pages):
    """A PDF with one line of text per page (Helvetica), written by hand."""
    objects = ["<< /Type /Catalog /Pages 2 0 R >>"]
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(len(pages)))
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>")
    font = 3 + 2 * len(pages)
    for i, text in enumerate(pages):
        stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET" if text else ""
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font} 0 R >> >> /Contents {4 + 2 * i} 0 R >>"
        )
        objects.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")
    objects.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out = "%PDF-1.4\n"
    offsets = []
    for n, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{n} 0 obj\n{body}\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    with open(path, "w", encoding="latin-1") as f:
        f.write(out)


class ExtractPdf(unittest.TestCase):
    def test_pages_stay_apart_for_the_search(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "cours.pdf")
            write_pdf(path, ["Chapitre un", "", "La fonction carree"])
            text = tools.extract_pdf({"path": path})["text"]
        # A page without text keeps its place: the third page is still third.
        self.assertEqual([p.strip() for p in text.split("\f")], ["Chapitre un", "", "La fonction carree"])

    def test_a_missing_file_gives_no_text(self):
        reply = tools.extract_pdf({"path": "/nulle/part.pdf"})
        self.assertEqual(reply["text"], "")
        self.assertIn("error", reply)


if __name__ == "__main__":
    unittest.main()
