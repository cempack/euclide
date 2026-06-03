#!/usr/bin/env python3
"""
Test for class "3D" using the *live* pronote_contents implementation (prof view fix).

Tests:
- Broad fetch for 3D (prof) + detailed "what are the contents" dump
- Subject filter specifically with GREC (plus ANGLAIS intercultural title check)
- Eleve view

Run:
  sidecar/.venv/bin/python sidecar/test_3d_contents.py
"""

import json
import sys
from pathlib import Path

def main():
    here = Path(__file__).parent
    candidates = [
        here / "euclide_sidecar.py",
        here.parent / "src-tauri" / "resources" / "euclide_sidecar.py",
        here / ".." / "src-tauri" / "resources" / "euclide_sidecar.py",
        Path("/Users/elliotmoreau/Desktop/Euclide/src-tauri/resources/euclide_sidecar.py"),
    ]
    sidecar_path = None
    for c in candidates:
        p = c.resolve() if hasattr(c, "resolve") else c
        if p.exists():
            sidecar_path = p
            break
    if not sidecar_path:
        print("euclide_sidecar.py not found. Tried:", [str(c) for c in candidates])
        sys.exit(1)
    print(f"Loading sidecar from: {sidecar_path}")

    # Load the live functions (they are defined at top level before the if __name__)
    ns = {}
    with open(sidecar_path, "r", encoding="utf-8") as f:
        code = f.read()
    exec(compile(code, str(sidecar_path), "exec"), ns)

    pronote_contents = ns.get("pronote_contents")
    if not pronote_contents:
        print("Could not load pronote_contents from sidecar")
        sys.exit(1)

    print("=== LIVE TEST: pronote_contents with class=3D on PROFESSEUR demo ===")
    payload = {
        "mode": "password",
        "url": "https://demo.index-education.net/pronote/professeur.html?login=true",
        "username": "demonstration",
        "password": "pronotevs",
        "class": "3D",
        # Use a wide from_date to catch demo data (demo seeds various periods)
        "from_date": "2025-01-01",
    }
    res = pronote_contents(payload)
    print("ok:", res.get("ok"))
    print("account_name:", res.get("account_name"))
    print("classe_used:", res.get("classe_used"))
    contents = res.get("contents", [])
    print("num contents:", len(contents))
    print("matieres count:", len(res.get("matieres", [])))
    mat_names = [m["name"] for m in res.get("matieres", [])[:8]]
    print("matieres sample:", mat_names)
    if contents:
        print("First few contents (newest):")
        for c in contents[:4]:
            print(" ", c.get("date_label"), c.get("start_time"), "-", c.get("subject"), ":", (c.get("title") or "")[:55])
            if c.get("description"):
                print("    desc:", (c.get("description") or "")[:70])
        # Look for the specific title mentioned in user report
        inter = [c for c in contents if "interculturelles" in (c.get("title") or "").lower()]
        if inter:
            print("  Found 'Courants et influences interculturelles' examples:", len(inter))
            ex = inter[0]
            print("   ex:", ex.get("date_label"), ex.get("subject"), ":", ex.get("title"))
    else:
        print("  -> No contents returned for 3D on prof demo.")

    # === DETAILED "WHAT ARE THE CONTENTS" ===
    print("\n" + "="*60)
    print("WHAT ARE THE CONTENTS (detailed samples for 3D prof view)")
    print("="*60)
    print("TOTAL CONTENTS:", len(contents))
    print("TOTAL MATIERES:", len(res.get("matieres", [])))
    print("\nMATIERES (top with counts):")
    for m in res.get("matieres", [])[:12]:
        print("  -", m.get("name"), ":", m.get("count"))

    print("\n--- DETAILED ITEM SAMPLES (first 4) ---")
    for i, c in enumerate(contents[:4]):
        print("\n[Content #{}]".format(i+1))
        print("  date:", c.get("date"))
        print("  date_label:", c.get("date_label"), " times:", c.get("start_time"), "-", c.get("end_time"))
        print("  subject:", c.get("subject"))
        print("  title:", c.get("title"))
        print("  category:", c.get("category"))
        print("  teachers:", repr(c.get("teachers")))
        print("  groups:", repr(c.get("groups")))
        print("  lesson_id:", c.get("lesson_id"))
        desc = c.get("description") or ""
        print("  description ({} chars): {}".format(len(desc), desc[:180] + ("..." if len(desc) > 180 else "")))

    print("\n--- ITEMS WITH ACTUAL DESCRIPTIONS (sample of 3) ---")
    with_desc = [c for c in contents if (c.get("description") or "").strip()]
    print("Count with non-empty description:", len(with_desc), "/", len(contents))
    for i, c in enumerate(with_desc[:3]):
        print("\n  [With desc #{}] {} | {}".format(i+1, c.get("date_label"), c.get("subject")))
        print("    title:", c.get("title"))
        print("    desc[:220]:", (c.get("description") or "")[:220])

    print("\n--- KNOWN TITLE CHECK: Courants et influences interculturelles ---")
    inter = [c for c in contents if "interculturelles" in (c.get("title") or "").lower()]
    print("Occurrences of the title:", len(inter))
    if inter:
        ex = inter[0]
        print("  Example item:")
        print("    date_label:", ex.get("date_label"), "subject:", ex.get("subject"))
        print("    title:", ex.get("title"))
        print("    category:", ex.get("category"), "teachers:", repr(ex.get("teachers")))
        print("    desc[:250]:", (ex.get("description") or "")[:250])

    print("\n--- DOCUMENTS / ATTACHMENTS (from broad 3D contents) ---")
    docs_any = [c for c in contents if c.get("documents")]
    print("Contents with documents in broad fetch:", len(docs_any))
    if docs_any:
        ex = docs_any[0]
        print("  ex title:", ex.get("title")[:60])
        for d in ex.get("documents", [])[:1]:
            print("    doc name:", d.get("name"), "type:", d.get("type"))
            print("    url prefix:", (d.get("url") or "")[:70])
    else:
        print("  (documents appear in subject-filtered views like GREC)")

    print("\n--- ITEM SHAPE / KEYS ---")
    if contents:
        first = contents[0]
        keys = sorted(first.keys())
        print("Keys present:", keys)
        required = ["date", "date_label", "start_time", "end_time", "subject", "title", "description", "category", "groups", "teachers", "lesson_id", "documents"]
        missing = [k for k in required if k not in first]
        print("Required keys all present:", len(missing) == 0, "(missing: {})".format(missing) if missing else "")
        print("Has 'end' raw field too:", "end" in first)
        print("Has 'documents' (attachments) field:", "documents" in first)

    print("="*60)
    print("END WHAT ARE THE CONTENTS")
    print("="*60)

    print("\n=== Test optional subject filter (GREC) + class=3D on PROF ===")
    payload_subj = {
        "mode": "password",
        "url": "https://demo.index-education.net/pronote/professeur.html?login=true",
        "username": "demonstration",
        "password": "pronotevs",
        "class": "3D",
        "subject": "GREC",
        "from_date": "2025-01-01",
    }
    res_subj = pronote_contents(payload_subj)
    subj_contents = res_subj.get("contents", [])
    print("num with subject=GREC:", len(subj_contents))
    print("matieres in filtered result:", [m["name"] for m in res_subj.get("matieres", [])])
    if subj_contents:
        print("  sample titles from filtered (GREC contents for 3D):")
        for c in subj_contents[:3]:
            print("   ", c.get("title")[:80])
        # verify filter actually reduced + scoped
        print("  (reduced from total {} to {}; all subjects match GREC: {})".format(
            len(contents), len(subj_contents),
            all("GREC" in (c.get("subject") or "").upper() for c in subj_contents[:5])
        ))

        print("\n  --- Detailed GREC samples (with descriptions) ---")
        with_desc_grec = [c for c in subj_contents if (c.get("description") or "").strip()]
        print("  GREC items with descriptions:", len(with_desc_grec), "/", len(subj_contents))
        for i, c in enumerate(with_desc_grec[:3]):
            print("\n    [GREC #" + str(i+1) + "] " + c.get("date_label") + " " + c.get("start_time") + "-" + c.get("end_time"))
            print("      title:", c.get("title"))
            print("      category:", c.get("category"), "teachers:", repr(c.get("teachers")))
            print("      groups:", repr(c.get("groups")))
            print("      desc[:220]:", (c.get("description") or "")[:220])
            docs = c.get("documents") or []
            if docs:
                print("      documents:", len(docs))
                for d in docs[:2]:
                    print("        -", d.get("name"), "type=", d.get("type"), "url[:80]=", (d.get("url") or "")[:80])

        # Also check any GREC items that have documents even without description (common for "Cahier de textes")
        with_docs = [c for c in subj_contents if c.get("documents")]
        print("  GREC items with documents (any):", len(with_docs))
        if with_docs:
            ex = with_docs[0]
            print("    ex docs:", [d.get("name") for d in ex.get("documents", [])])

        # Check for key GREC topics that exist in the demo data (e.g. A2 writing, cahier examples)
        a2 = [c for c in subj_contents if "A2" in (c.get("title") or "") or "message simple" in (c.get("title") or "").lower()]
        cahier = [c for c in subj_contents if "cahier de textes" in (c.get("title") or "").lower() or "cahier de textes" in (c.get("description") or "").lower()]
        print("\n  Key topic checks:")
        print("    Items on 'Niveau A2' / 'message simple':", len(a2), "(example title: " + (a2[0].get("title")[:60] if a2 else "none") + ")")
        print("    Items on 'Cahier de textes':", len(cahier), "(example title: " + (cahier[0].get("title")[:60] if cahier else "none") + ")")

    print("\n=== LIVE TEST: ELEVE demo (no class filter, student's own class contents) ===")
    # For eleve accounts, there is no listeClasses and contents are implicitly for the
    # logged-in student's class/groups; the "class" filter (post-filter on groups) does
    # not reliably match "3D" because groups are often empty or sub-group names like 3LATINGR.1.
    # So we test without class filter here to verify real data is returned.
    payload_e = {
        "mode": "password",
        "url": "https://demo.index-education.net/pronote/eleve.html?login=true",
        "username": "demonstration",
        "password": "pronotevs",
    }
    res_e = pronote_contents(payload_e)
    print("ok:", res_e.get("ok"))
    e_contents = res_e.get("contents", [])
    print("num contents (eleve own class):", len(e_contents))
    print("matieres sample:", [m["name"] for m in res_e.get("matieres", [])[:5]])
    if e_contents:
        ex = e_contents[0]
        print("  first eleve item:", ex.get("date_label"), ex.get("subject"), ":", (ex.get("title") or "")[:50])
        # show one with desc if any
        e_with = next((c for c in e_contents if c.get("description")), None)
        if e_with:
            print("  eleve with desc example title:", e_with.get("title"))
            print("    desc[:120]:", (e_with.get("description") or "")[:120])

    # Final verification summary
    prof_ok = res.get("ok") and len(contents) > 50
    inter_ok = len([c for c in contents if "interculturelles" in (c.get("title") or "").lower()]) > 0
    subj_ok = len(subj_contents) > 0 and len(subj_contents) < len(contents) and all("GREC" in (c.get("subject") or "").upper() for c in subj_contents[:5] if subj_contents)
    eleve_ok = res_e.get("ok") and len(e_contents) > 10
    docs_ok = len([c for c in contents if c.get("documents")]) > 0 or len([c for c in subj_contents if c.get("documents")]) > 0
    print("\n=== VERIFICATION SUMMARY ===")
    print("Prof 3D returned substantial contents:", "PASS" if prof_ok else "FAIL", "(count={})".format(len(contents)))
    print("Known title 'Courants et influences interculturelles' present:", "PASS" if inter_ok else "FAIL")
    print("Subject filter works (GREC reduces + scopes correctly):", "PASS" if subj_ok else "FAIL")
    print("Eleve returns real own-class contents:", "PASS" if eleve_ok else "FAIL")
    print("Attached documents (ListePieceJointe) are retrieved (e.g. 'Test Doc CDT.txt' with URL):", "PASS" if docs_ok else "FAIL")
    all_pass = prof_ok and inter_ok and subj_ok and eleve_ok and docs_ok
    print("\nOVERALL:", "ALL CHECKS PASSED - real lesson contents + attached documents are found for 3D in prof view." if all_pass else "SOME CHECKS FAILED")
    print("Test complete. Used updated pronote_contents with 'ressource'=class scoping for professeur accounts.")

if __name__ == "__main__":
    main()