import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { log, pictures } from "virtual:changelog";
import { tr } from "../lib/i18n";
import { Icon } from "../ui/Icon";
import { PageHeader } from "../components/layout";
import { KIND_ICONS } from "../shell/nav";
import { releases, releasesSince, withPictures } from "../features/news/changelog";

/** The changelog this build of Euclide carries, read once. */
const ALL = releases(log);
const REMARK = [remarkGfm];

const COMPONENTS: Components = {
  // A screenshot framed like one, loaded when it comes into view.
  img: ({ src, alt }) => (
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      className="block w-full border border-line rounded-md"
    />
  ),
  a: ({ node: _node, href = "", ...props }) => (
    <a {...props} href={href} target="_blank" rel="noopener noreferrer" />
  ),
};

/**
 * « Nouveautés »: what changed, version after version, with its pictures.
 * After an update (`since`, the version it came from), every version since
 * then, skipped ones included; « Versions précédentes » shows the rest.
 */
export default function News({ since }: { since?: string }) {
  const [older, setOlder] = useState(false);
  const newer = since ? releasesSince(ALL, since) : ALL;
  const shown = older || !newer.length ? ALL : newer;
  return (
    <>
      <PageHeader
        title={tr("news.title")}
        icon={<Icon icon={KIND_ICONS.news} size={20} />}
        meta={since && newer.length ? tr("news.since", { version: since }) : tr("news.all")}
      />
      {/* Focusable: with nothing else to tab to, the keyboard scrolls it. */}
      <article tabIndex={0} aria-label={tr("news.title")} className="mt-6 flex flex-col max-w-[46rem]">
        {shown.map((release, i) => (
          <section
            key={release.version}
            aria-labelledby={`news-${release.version}`}
            className={i ? "mt-10 pt-8 border-t border-line" : undefined}
          >
            <h2
              id={`news-${release.version}`}
              className="text-[1.25rem] font-semibold tracking-tight text-ink"
            >
              {tr("news.version", { version: release.version })}
            </h2>
            <div className="eu-prose eu-news mt-4">
              <ReactMarkdown remarkPlugins={REMARK} components={COMPONENTS} skipHtml>
                {withPictures(release.body, pictures)}
              </ReactMarkdown>
            </div>
          </section>
        ))}
        {shown !== ALL && (
          <button
            type="button"
            onClick={() => setOlder(true)}
            className="eu-btn-quiet eu-btn-sm self-start mt-8"
          >
            {tr("news.older")}
          </button>
        )}
      </article>
    </>
  );
}
