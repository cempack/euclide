import { useQuery } from "@tanstack/react-query";
import { q } from "../api/queries";
import { tabs } from "../stores/tabs";
import { api } from "../lib/api";
import { EmptyState, Loading, useToast } from "../components/ui";
import { MetaDot, PageHeader, Panel } from "../components/layout";
import { tr, trn } from "../lib/i18n";
import { logged } from "../lib/report";
import { BookIcon, DocIcon, RefreshIcon } from "../components/icons";

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

  const coursesQ = useQuery(q.courses());
  const course = coursesQ.data?.find((x) => x.id === courseId) ?? null;
  const matiereKnown = matiere || course?.matiere || "";
  const contentsQ = useQuery({
    ...q.pronoteContents(subjectForPronote(matiereKnown), className),
    enabled: !!matiereKnown,
  });
  const contents = (contentsQ.data ?? NO_CONTENTS) as ContentItem[];
  const noMatiere = !coursesQ.isPending && !matiereKnown;
  const loading = coursesQ.isPending || (!!matiereKnown && contentsQ.isPending);
  // A refetch with data on screen: keep it, show the refresh.
  const isRefreshing = contentsQ.isFetching && !contentsQ.isPending;
  const lastRefresh = contentsQ.dataUpdatedAt ? new Date(contentsQ.dataUpdatedAt) : null;
  const error = noMatiere
    ? "Aucune matière définie pour ce cours. Modifiez le cours pour choisir Mathématiques, NSI ou Maths expertes."
    : contentsQ.error
      ? contentsQ.error.message ||
        "Impossible de récupérer le contenu Pronote. Vérifiez la connexion Pronote (prof)."
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
        toast(tr("classContent.linkFallback").replace("{url}", url), "success");
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
        icon={<BookIcon className="w-5 h-5" />}
        title={tr("classContent.title").replace("{class}", className)}
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
          <button
            onClick={refreshContents}
            className="eu-btn-ghost eu-btn-sm"
            disabled={loading || isRefreshing}
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${loading || isRefreshing ? "animate-spin" : ""}`} />
            {loading || isRefreshing ? tr("classContent.refreshing") : tr("classContent.refresh")}
          </button>
        }
      />

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
            icon={<BookIcon className="w-4 h-4" />}
            title={tr("classContent.noContent")}
            hint={tr("classContent.noContentHint")
              .replace("{class}", className)
              .replace("{matiere}", effectiveMatiere)}
            action={
              <button onClick={refreshContents} className="eu-btn-ghost eu-btn-sm">
                <RefreshIcon className="w-3.5 h-3.5" />
                {tr("classContent.refresh")}
              </button>
            }
          />
        </Panel>
      ) : (
        <div className={`space-y-4 ${loading || isRefreshing ? "opacity-60" : ""}`}>
          {contents.map((c, idx) => (
            <div key={idx} className="eu-panel p-[14px]">
              <div className="flex items-start gap-3.5">
                {/* Date rail: the spine of a cahier de textes. */}
                <div className="w-[92px] shrink-0 eu-panel-alt rounded px-2 py-1.5">
                  <p className="eu-t-caption text-ink">{c.date_label || c.date?.slice(0, 10)}</p>
                  <p className="eu-t-caption mt-0.5">
                    {c.start_time}–{c.end_time}
                  </p>
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  {/* Title + category — more prominent */}
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <BookIcon className="w-4 h-4 text-ink-muted shrink-0" />
                    <span className="eu-t-title text-ink">{c.title || "(sans titre)"}</span>
                    {c.category && <span className="eu-chip">{c.category}</span>}
                    {c.subject && c.subject !== effectiveMatiere && (
                      <span className="eu-t-caption text-ink-muted">({c.subject})</span>
                    )}
                  </div>

                  {/* Description — the actual lesson content */}
                  {c.description && <p className="eu-t-body text-ink">{c.description}</p>}

                  {/* Meta */}
                  {c.groups && <div className="eu-t-small text-ink-muted">Groupes : {c.groups}</div>}

                  {/* Documents — now a distinctive attachment block */}
                  {c.documents && c.documents.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-line">
                      <div className="eu-t-label mb-1.5">Documents joints ({c.documents.length})</div>
                      <div className="flex flex-wrap gap-1.5">
                        {c.documents.map((d, di) => (
                          <div
                            key={di}
                            className="flex items-center gap-1.5 eu-t-small bg-panel-alt border border-line rounded px-2 py-1 max-w-full"
                          >
                            <DocIcon className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                            {d.url ? (
                              <button
                                onClick={() => {
                                  if (!d.url) return;
                                  api.openUrl(d.url).catch(logged("classContent.openUrl"));
                                }}
                                className="truncate font-medium max-w-[220px] text-left hover:underline hover:text-ink focus:outline-hidden"
                                data-tip="Ouvrir dans le navigateur"
                              >
                                {d.name}
                              </button>
                            ) : (
                              <span className="truncate font-medium max-w-[220px]">{d.name}</span>
                            )}
                            {d.url && (
                              <button
                                onClick={() => copyUrl(d.url)}
                                className="eu-btn-quiet eu-btn-sm ml-1"
                                data-tip="Copier le lien direct Pronote"
                              >
                                copier
                              </button>
                            )}
                            <span className="eu-t-caption ml-1">{d.type === 1 ? "fichier" : "lien"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
