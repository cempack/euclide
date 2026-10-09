import { memo, useState } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { fileUrl } from "../../lib/api";
import { tr } from "../../lib/i18n";
import { imageSize, libraryFileId } from "./images";
import { displayMath } from "./math";

// Built once: new plugin arrays or components on each render made
// react-markdown parse the note and re-render all its formulas on every
// keystroke, even while the text itself had not changed.
// GitHub's Markdown: tables, ~~struck~~ text, task lists, footnotes. A lone
// « ~ » (« ~ 10 min ») stays a tilde.
const REMARK_PLUGINS: Options["remarkPlugins"] = [[remarkGfm, { singleTilde: false }], remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];
const REMARK_REHYPE: Options["remarkRehypeOptions"] = {
  footnoteLabel: tr("notes.footnotes"),
  footnoteLabelTagName: "p",
  footnoteLabelProperties: { className: ["eu-prose-footnotes-label"] },
  footnoteBackLabel: tr("notes.footnoteBack"),
};

/** The library's pictures keep their `eufile://file/<id>`; other addresses are checked as usual. */
const urlTransform = (url: string) => (libraryFileId(url) != null ? url : defaultUrlTransform(url));

/**
 * A picture: one of the library's by its id, at the width set after a `|`.
 * One that cannot load (its document deleted) says so in its place.
 */
function Picture({ src, alt = "", title }: { src?: string; alt?: string; title?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const id = src ? libraryFileId(src) : null;
  const url = id != null ? fileUrl(id) : (src ?? "");
  const { text, width } = imageSize(alt);
  if (!url || failed === url) {
    return (
      <span className="eu-prose-missing">
        {text ? tr("notes.imageMissingNamed", { name: text }) : tr("notes.imageMissing")}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={text}
      title={title}
      style={width ? { width } : undefined}
      onError={() => setFailed(url)}
    />
  );
}

const COMPONENTS: Components = {
  // A link to a page opens in the browser; one to a footnote scrolls the note.
  a: ({ node: _node, href = "", ...props }) =>
    href.startsWith("#") ? (
      <a
        {...props}
        href={href}
        onClick={(e) => {
          e.preventDefault();
          const scope = e.currentTarget.closest(".eu-prose");
          scope?.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`)?.scrollIntoView({
            block: "nearest",
          });
        }}
      />
    ) : (
      <a {...props} href={href} target="_blank" rel="noopener noreferrer" />
    ),
  img: ({ src, alt, title }) => (
    <Picture src={typeof src === "string" ? src : undefined} alt={alt} title={title} />
  ),
  // A wide table scrolls on its own rather than widen the note.
  table: ({ node: _node, ...props }) => (
    <div className="eu-prose-table">
      <table {...props} />
    </div>
  ),
};

/**
 * A note's Markdown with its formulas (KaTeX), tables and pictures: the same
 * rendering for the preview, the slides and the printed page. Renders again
 * only when its text changes.
 */
export const Markdown = memo(function Markdown({
  body,
  className = "",
}: {
  body: string;
  className?: string;
}) {
  return (
    <div className={`eu-prose ${className}`}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        remarkRehypeOptions={REMARK_REHYPE}
        urlTransform={urlTransform}
        components={COMPONENTS}
      >
        {displayMath(body)}
      </ReactMarkdown>
    </div>
  );
});
