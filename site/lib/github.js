// What the site shows of Euclide comes from GitHub: the releases and their
// files, and CHANGELOG.md at the latest one. Kept 10 minutes, and kept
// longer when GitHub does not answer: the site shows the last it knew.

const REPO = process.env.GITHUB_REPO || "cempack/euclide";
const TTL = 10 * 60 * 1000;

export const repoUrl = `https://github.com/${REPO}`;
export const rawUrl = (ref, path) => `https://raw.githubusercontent.com/${REPO}/${ref}/${path}`;

const cache = new Map();

async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  try {
    const value = await load();
    cache.set(key, { value, at: Date.now() });
    return value;
  } catch (err) {
    if (hit) return hit.value;
    throw err;
  }
}

async function get(url, accept) {
  const headers = { "User-Agent": "euclide-site", Accept: accept };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);
  return res;
}

/** What a file of a release is for, or null for what only the updater uses. */
export function platformOf(name) {
  if (/windows-portable\.zip$/i.test(name)) return "windows-portable";
  if (/setup\.exe$/i.test(name) || /\.msi$/i.test(name)) return "windows-installer";
  if (/linux-portable\.AppImage$/i.test(name)) return "linux";
  if (/\.AppImage$/i.test(name)) return "linux-versioned";
  if (/macos.*\.zip$/i.test(name)) return "macos";
  return null;
}

/** The published releases, newest first. */
export function releases() {
  return cached("releases", async () => {
    const res = await get(
      `https://api.github.com/repos/${REPO}/releases?per_page=50`,
      "application/vnd.github+json",
    );
    const list = await res.json();
    return list
      .filter((r) => !r.draft && !r.prerelease)
      .map((r) => ({
        tag: r.tag_name,
        version: r.tag_name.replace(/^v/, ""),
        url: r.html_url,
        publishedAt: r.published_at,
        assets: r.assets.map((a) => ({
          name: a.name,
          size: a.size,
          downloads: a.download_count,
          url: a.browser_download_url,
          platform: platformOf(a.name),
        })),
      }));
  });
}

/** CHANGELOG.md as of `tag`. */
export function changelog(tag) {
  return cached(`changelog:${tag}`, async () => {
    const res = await get(rawUrl(tag, "CHANGELOG.md"), "text/plain");
    return res.text();
  });
}

/** For tests: forget what was fetched. */
export function clearCache() {
  cache.clear();
}
