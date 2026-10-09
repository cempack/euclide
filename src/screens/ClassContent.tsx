import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { q } from "../api/queries";
import { tabs } from "../stores/tabs";
import { api } from "../lib/api";
import { EmptyState, Loading, useToast } from "../components/ui";
import { MetaDot, PageHeader, Panel, Segmented } from "../components/layout";
import { tr, trn } from "../lib/i18n";
import { parseLessonDate } from "../lib/format";
import { logged } from "../lib/report";
import { BookOpen, FileText, RefreshCw } from "lucide-react";
import { Copy } from "lucide-react";
import { Icon } from "../ui/Icon";
import { matiereMatches } from "../features/classroom/lesson";
import { StudentsPanel } from "../features/classroom/StudentsPanel";

interface ContentItem {
  date?: string;
  date_label?: string;
  start_time?: string;
  end_time?: string;
  subject?: string;
  title?: string;
  description?: string;
  category?: string;
  groups?: string;
  teachers?: string;
  lesson_id?: string;
  documents?: Array<{ name: string; id?: string; type?: number; url?: string; estUnLienInterne?: boolean }>;
}

const NO_CONTENTS: ContentItem[] = [];

/** The Monday of a date's week, at midnight. */
function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/**
 * Lessons by week, most recent first: « Cette semaine », « Semaine
 * dernière », then « Semaine du lundi 22 septembre ».
 */
function byWeek(items: ContentItem[]): { key: string; label: string; items: ContentItem[] }[] {
  const thisWeek = mondayOf(new Date()).getTime();
  const DAY = 86_400_000;
  const weeks = new Map<number, ContentItem[]>();
  for (const c of items) {
    const day = parseLessonDate(c.date);
    const at = day ? mondayOf(day).getTime() : 0;
    weeks.set(at, [...(weeks.get(at) ?? []), c]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => b - a)
    .map(([at, list]) => {
      const days = Math.round((at - thisWeek) / DAY);
      const label = !at
        ? tr("classContent.weekUnknown")
        : days === 0
          ? tr("classContent.weekThis")
          : days === -7
            ? tr("classContent.weekLast")
            : days === 7
              ? tr("classContent.weekNext")
              : tr("classContent.weekOf", {
                  date: new Date(at).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }),
                });
      const sorted = list
        .slice()
        .sort(
          (a, b) => (parseLessonDate(b.date)?.getTime() ?? 0) - (parseLessonDate(a.date)?.getTime() ?? 0),
        );
      return { key: String(at), label, items: sorted };
    });
}

export default function ClassContent({
  courseId,
  className,
  matiere,
}: {
  courseId: number;
  className: string;
  matiere: string;
}) {
  const toast = useToast();
  const subjectForPronote = (m: string) => {
    const lower = (m || "").toLowerCase();
    if (lower.includes("experte")) return "MATHÉMATIQUES EXPERTES";
    if (lower.includes("math")) return "MATHÉMATIQUES";
    if (lower.includes("nsi") || lower.includes("informatique") || lower.includes("numérique"))
      return "INFORM"; // robust substring for "NUMERIQUE SC.INFORM." etc.
    return m || ""; // fallback, partial match will try
  };

  const [since, setSince] = useState<"month" | "term" | "year">("month");
  const coursesQ = useQuery(q.courses());
  const course = coursesQ.data?.find((x) => x.id === courseId) ?? null;
  const matiereKnown = matiere || course?.matiere || "";
  const contentsQ = useQuery({
    ...q.pronoteContents(subjectForPronote(matiereKnown), className, since),
    enabled: !!matiereKnown,
  });
  const contents = (contentsQ.data ?? NO_CONTENTS) as ContentItem[];
  const noMatiere = !coursesQ.isPending && !matiereKnown;
  const loading = coursesQ.isPending || (!!matiereKnown && contentsQ.isPending);
  // A refetch with data on screen: keep it, show the refresh.
  const isRefreshing = contentsQ.isFetching && !contentsQ.isPending;
  const lastRefresh = contentsQ.dataUpdatedAt ? new Date(contentsQ.dataUpdatedAt) : null;
  const error = noMatiere
    ? tr("classContent.noMatiere")
    : contentsQ.error
      ? contentsQ.error.message || tr("classContent.loadError")
      : null;

  const copyUrl = (url?: string) => {
    if (!url) return;
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        toast(tr("classContent.linkCopied"), "success");
      })
      .catch(() => {
        // No clipboard access: show the link instead.
        toast(tr("classContent.linkFallback", { url }), "success");
      });
  };

  const effectiveMatiere = matiere || course?.matiere || "—";

  const refreshContents = () => void contentsQ.refetch();
  const retryLoad = refreshContents;

  return (
    <>
      <PageHeader
        onBack={() => {
          // Navigate back to the parent course tab; close self first to avoid id races.
          const selfId = tabs.activeId();
          tabs.open({
            kind: "course",
            title: course?.name || tr("nav.courses"),
            params: { courseId },
          });
          if (selfId) tabs.close(selfId);
        }}
        backLabel={course?.name || tr("classContent.back")}
        icon={<Icon icon={BookOpen} size={20} />}
        title={tr("classContent.title", { class: className })}
        meta={
          <>
            <span>{effectiveMatiere || tr("common.none")}</span>
            {contents.length > 0 && (
              <>
                <MetaDot />
                <span>{trn("classContent.metaEntries", contents.length)}</span>
              </>
            )}
            {lastRefresh && (
              <>
                <MetaDot />
                <span>
                  {tr("classContent.metaRefreshed", {
                    time: lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
                  })}
                </span>
              </>
            )}
          </>
        }
        actions={
          <>
            <Segmented
              value={since}
              onChange={setSince}
              label={tr("classContent.since")}
              options={[
                { value: "month", label: tr("classContent.sinceMonth") },
                { value: "term", label: tr("classContent.sinceTerm") },
                { value: "year", label: tr("classContent.sinceYear") },
              ]}
            />
            <button
              onClick={refreshContents}
              className="eu-btn-ghost eu-btn-sm"
              disabled={loading || isRefreshing}
            >
              <Icon
                icon={RefreshCw}
                size={20}
                className={`w-3.5 h-3.5 ${loading || isRefreshing ? "animate-spin" : ""}`}
              />
              {loading || isRefreshing ? tr("classContent.refreshing") : tr("classContent.refresh")}
            </button>
          </>
        }
      />

      <StudentsPanel className={className} />

      {error && (
        <div className="eu-panel border-danger/30 bg-danger-soft p-[14px] flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="eu-t-section text-danger">{tr("classContent.errorTitle")}</p>
            <p className="eu-t-body text-danger/90 mt-1">{error}</p>
          </div>
          <button className="eu-btn-ghost eu-btn-sm shrink-0" onClick={retryLoad}>
            {tr("common.retry")}
          </button>
        </div>
      )}

      {loading && contents.length === 0 ? (
        <Panel>
          <Loading
            label={tr("classContent.loadingFor", {
              class: className,
            })}
          />
        </Panel>
      ) : contents.length === 0 && !error ? (
        <Panel>
          <EmptyState
            icon={<Icon icon={BookOpen} size={16} />}
            title={tr("classContent.noContent")}
            hint={tr("classContent.noContentHint", { class: className, matiere: effectiveMatiere })}
            action={
              <button onClick={refreshContents} className="eu-btn-ghost eu-btn-sm">
                <Icon icon={RefreshCw} size={14} />
                {tr("classContent.refresh")}
              </button>
            }
          />
        </Panel>
      ) : (
        <div className={`flex flex-col gap-5 ${loading || isRefreshing ? "opacity-60" : ""}`}>
          {byWeek(contents).map((week) => (
            <section key={week.key} aria-label={week.label}>
              <h2 className="eu-t-label mb-2">{week.label}</h2>
              <div className="eu-panel eu-divide selectable">
                {week.items.map((c, idx) => (
                  <article key={`${c.lesson_id ?? idx}-${c.date}`} className="eu-lesson">
                    {/* The date rail: the spine of a cahier de textes. */}
                    <div className="eu-lesson-date">
                      <p className="eu-t-small text-ink font-medium first-letter:uppercase">
                        {c.date_label || c.date?.slice(0, 10)}
                      </p>
                      <p className="eu-t-caption mt-0.5">
                        {c.start_time}–{c.end_time}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="eu-t-title text-ink">{c.title || tr("classContent.untitled")}</span>
                        {c.category && <span className="eu-chip">{c.category}</span>}
                        {c.subject && !matiereMatches(effectiveMatiere, c.subject) && (
                          <span className="eu-t-caption">{c.subject}</span>
                        )}
                      </div>
                      {c.description && (
                        <p className="eu-t-body text-ink whitespace-pre-line">{c.description}</p>
                      )}
                      {c.groups && (
                        <p className="eu-t-meta">{tr("classContent.groups", { groups: c.groups })}</p>
                      )}
                      {c.documents && c.documents.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {c.documents.map((d, di) => (
                            <span key={di} className="eu-resource">
                              {d.url ? (
                                <button
                                  type="button"
                                  className="eu-resource-open"
                                  onClick={() => api.openUrl(d.url!).catch(logged("classContent.openUrl"))}
                                  data-tip={tr("classContent.openInBrowser")}
                                >
                                  <Icon icon={FileText} size={14} className="shrink-0 text-ink-faint" />
                                  <span className="truncate">{d.name}</span>
                                </button>
                              ) : (
                                <span className="eu-resource-open">
                                  <Icon icon={FileText} size={14} className="shrink-0 text-ink-faint" />
                                  <span className="truncate">{d.name}</span>
                                </span>
                              )}
                              {d.url && (
                                <button
                                  type="button"
                                  className="eu-resource-copy"
                                  onClick={() => copyUrl(d.url)}
                                  aria-label={tr("classContent.copyLink", { name: d.name })}
                                  data-tip={tr("classContent.copyLinkTip")}
                                >
                                  <Icon icon={Copy} size={14} />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
