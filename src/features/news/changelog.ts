/** One version of CHANGELOG.md: its number and what follows its `## x.y.z`. */
export type Release = { version: string; body: string };

/** The versions of the changelog, as written: the newest first. */
export function releases(log: string): Release[] {
  const found: Release[] = [];
  for (const part of log.split(/^## /m).slice(1)) {
    const end = part.indexOf("\n");
    const version = (end < 0 ? part : part.slice(0, end)).trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    found.push({ version, body: end < 0 ? "" : part.slice(end + 1).trim() });
  }
  return found;
}

/**
 * Below 0, 0 or above 0, as `a` comes before `b`. Missing parts count as 0:
 * an Euclide older than 0.3 calls itself "0.1".
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** The versions after `since` (the one Euclide was updated from), the newest first. */
export function releasesSince(all: Release[], since: string): Release[] {
  return all.filter((r) => compareVersions(r.version, since) > 0);
}

/** Pictures named by their path in the changelog (`docs/changelog/…`) point to where the app keeps them. */
export function withPictures(body: string, pictures: Record<string, string>): string {
  return body.replace(/\]\((docs\/changelog\/[^)\s]+)\)/g, (whole, path: string) =>
    pictures[path] ? `](${pictures[path]})` : whole,
  );
}
