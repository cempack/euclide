import { describe, expect, it } from "vitest";
import { compareVersions, releases, releasesSince, withPictures } from "./changelog";

const LOG = `# Journal des versions

Ce qui change d'une version d'Euclide à l'autre.

## 0.6.0

### PDF

- Un trait.

![Une page annotée](docs/changelog/0.6.0/annoter.jpg)

## 0.5.0

- Un tirage.

## 0.4.2

- Une note sans titre.

## 0.4.10

- Plus haut que 0.4.2.

## Brouillon

- Pas une version.
`;

describe("releases", () => {
  it("reads each version and what it says, the newest first", () => {
    const all = releases(LOG);
    expect(all.map((r) => r.version)).toEqual(["0.6.0", "0.5.0", "0.4.2", "0.4.10"]);
    expect(all[0].body).toBe(
      "### PDF\n\n- Un trait.\n\n![Une page annotée](docs/changelog/0.6.0/annoter.jpg)",
    );
    expect(all[1].body).toBe("- Un tirage.");
  });

  it("finds nothing in a text without versions", () => {
    expect(releases("# Journal\n\nRien.")).toEqual([]);
  });
});

describe("compareVersions", () => {
  it("compares each number, not the text", () => {
    expect(compareVersions("0.4.10", "0.4.2")).toBeGreaterThan(0);
    expect(compareVersions("0.5.0", "0.6.0")).toBeLessThan(0);
    expect(compareVersions("0.6.0", "0.6.0")).toBe(0);
  });

  it("takes an Euclide before 0.3 (« 0.1 ») as 0.1.0", () => {
    expect(compareVersions("0.1", "0.1.0")).toBe(0);
    expect(compareVersions("0.3.0", "0.1")).toBeGreaterThan(0);
  });
});

describe("releasesSince", () => {
  it("keeps every version after the one updated from, skipped ones included", () => {
    const all = releases(LOG);
    expect(releasesSince(all, "0.4.2").map((r) => r.version)).toEqual(["0.6.0", "0.5.0", "0.4.10"]);
    expect(releasesSince(all, "0.6.0")).toEqual([]);
  });
});

describe("withPictures", () => {
  it("points the changelog's pictures to the app's copies, and leaves the others", () => {
    const body = "![Une page](docs/changelog/0.6.0/annoter.jpg) ![Autre](docs/changelog/0.6.0/absente.jpg)";
    expect(withPictures(body, { "docs/changelog/0.6.0/annoter.jpg": "/assets/annoter-1a2b.jpg" })).toBe(
      "![Une page](/assets/annoter-1a2b.jpg) ![Autre](docs/changelog/0.6.0/absente.jpg)",
    );
  });
});
