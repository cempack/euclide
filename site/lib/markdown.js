// The little Markdown CHANGELOG.md is written in: headings, lists,
// paragraphs, **bold**, `code`, links and pictures. No raw HTML: everything
// else is text, escaped.

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** A link or a picture's address, absolute; anything but http(s) is dropped. */
function address(url, resolve) {
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return null;
  return resolve ? resolve(url) : null;
}

const INLINE = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|`([^`]+)`/g;

export function inline(text, resolve) {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    out += escape(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[2] !== undefined) {
      const src = address(m[2], resolve);
      out += src
        ? `<img src="${escape(src)}" alt="${escape(m[1])}" loading="lazy" decoding="async">`
        : escape(m[1]);
    } else if (m[4] !== undefined) {
      const href = address(m[4], resolve);
      const label = inline(m[3], resolve);
      out += href ? `<a href="${escape(href)}" rel="noopener">${label}</a>` : label;
    } else if (m[5] !== undefined) {
      out += `<strong>${inline(m[5], resolve)}</strong>`;
    } else {
      out += `<code>${escape(m[6])}</code>`;
    }
  }
  return out + escape(text.slice(last));
}

/** Markdown blocks to HTML. `resolve` turns a relative path into a URL. */
export function render(markdown, resolve) {
  const html = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    // A picture alone on its line is a figure.
    html.push(
      /^!\[[^\]]*\]\([^)\s]+\)$/.test(text)
        ? `<figure>${inline(text, resolve)}</figure>`
        : `<p>${inline(text, resolve)}</p>`,
    );
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    html.push(`<ul>${list.map((item) => `<li>${inline(item, resolve)}</li>`).join("")}</ul>`);
    list = null;
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      // The page has its own h1 and h2: a section's headings start at h3.
      const level = Math.max(3, Math.min(6, heading[1].length));
      html.push(`<h${level}>${inline(heading[2], resolve)}</h${level}>`);
    } else if (item) {
      flushParagraph();
      (list ??= []).push(item[1]);
    } else if (list && /^\s{2,}\S/.test(raw)) {
      // A list item that runs on to the next line.
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return html.join("\n");
}

/** CHANGELOG.md cut into its versions, newest first: { version, body }. */
export function releases(changelog) {
  const out = [];
  let current = null;
  for (const line of changelog.split(/\r?\n/)) {
    const m = /^##\s+\[?v?(\d+\.\d+\.\d+)\]?/.exec(line);
    if (m) {
      current = { version: m[1], body: [] };
      out.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  return out.map((r) => ({ version: r.version, body: r.body.join("\n").trim() }));
}
