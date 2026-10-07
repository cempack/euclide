import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { displayMath } from "./math";

// Built once: new plugin arrays or components on each render made
// react-markdown parse the note and re-render all its formulas on every
// keystroke, even while the text itself had not changed.
const REMARK_PLUGINS = [remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];
const COMPONENTS = {
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

/**
 * A note's Markdown with its formulas (KaTeX): the same rendering for the
 * preview, the slides and the printed page. Renders again only when its
 * text changes.
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
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
        {displayMath(body)}
      </ReactMarkdown>
    </div>
  );
});
