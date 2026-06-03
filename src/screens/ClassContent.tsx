import { useEffect, useRef, useState } from "react";
import { useTabs } from "../lib/tabs";
import { api, isTauri } from "../lib/api";
import { EmptyState, Loading, useToast } from "../components/ui";
import { get } from "../lib/i18n";
import { ArrowRightIcon, BookIcon, DocIcon, RefreshIcon } from "../components/icons";

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

// TTL cache for Pronote lesson contents (per course/class/matiere) to avoid repeated sidecar fetches.
const contentCache = new Map<string, { data: ContentItem[]; ts: number }>();
const CONTENT_CACHE_TTL = 10 * 60 * 1000;

export default function ClassContent({
  courseId,
  className,
  matiere,
}: {
  courseId: number;
  className: string;
  matiere: string;
}) {
  const tabs = useTabs();
  const toast = useToast();
  const [course, setCourse] = useState<any>(null);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const subjectForPronote = (m: string) => {
    const lower = (m || "").toLowerCase();
    if (lower.includes("experte")) return "MATHÉMATIQUES EXPERTES";
    if (lower.includes("math")) return "MATHÉMATIQUES";
    if (lower.includes("nsi") || lower.includes("informatique") || lower.includes("numérique")) return "INFORM";  // robust substring for "NUMERIQUE SC.INFORM." etc.
    return m || ""; // fallback, partial match will try
  };

  const load = async (forceFresh = false) => {
    setError(null);

    // Always fetch course meta (cheap local DB) so back-link title and matiere are fresh.
    let c: any = null;
    try {
      const cs = await api.listCourses();
      c = cs.find((x: any) => x.id === courseId);
      setCourse(c || null);
    } catch {
      // keep previous course if any
    }

    const cacheKey = `${courseId}:${className}:${matiere || ""}`;
    const cached = contentCache.get(cacheKey);
    const now = Date.now();

    const noMatiere = !c?.matiere && !matiere;
    if (noMatiere) {
      setError("Aucune matière définie pour ce cours. Modifiez le cours pour choisir Mathématiques, NSI ou Maths expertes.");
      setContents([]);
      setLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (!forceFresh && cached && now - cached.ts < CONTENT_CACHE_TTL) {
      // Fresh cache hit: instant open, no network.
      setContents(cached.data);
      setLastRefresh(new Date(cached.ts));
      setLoading(false);
      setIsRefreshing(false);
      return;
    }

    const hasStale = !forceFresh && !!cached;
    if (hasStale) {
      // Show previous data immediately, refresh in background (stale-while-revalidate).
      setContents(cached!.data);
      setLastRefresh(new Date(cached!.ts));
      setLoading(false);
      setIsRefreshing(true);
    } else {
      setLoading(true);
      setIsRefreshing(false);
    }

    try {
      const effectiveMatiere = matiere || c?.matiere || "";
      const subject = subjectForPronote(effectiveMatiere);

      // Do not pass fromDate here: let the sidecar use its default (120 days back relative to the
      // Pronote "today"/calendar). Ensures recent data for real + demo instances.
      // in 2025-2026 periods relative to the demo's "now"). The returned list is already newest-first.
      const res = await api.pronoteContents(subject, className);
      if (!res?.ok) {
        throw new Error(res?.error || "Erreur Pronote");
      }
      let items: ContentItem[] = res.contents || [];
      // Ensure sorted newest first (already done in sidecar but defensive)
      items = [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      // Cap to recent entries.
      items = items.slice(0, 30);
      setContents(items);
      const rt = new Date();
      setLastRefresh(rt);
      contentCache.set(cacheKey, { data: items, ts: rt.getTime() });
      if (items.length === 0) {
        toast(get("classContent.noPronoteContent", "Aucun contenu Pronote trouvé pour cette classe/matière."), "success");
      }
    } catch (e: any) {
      setError(e?.message || "Impossible de récupérer le contenu Pronote. Vérifiez la connexion Pronote (prof).");
      if (!hasStale) {
        setContents([]);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, className, matiere]);

  const copyUrl = (url?: string) => {
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => {
      toast(get("classContent.linkCopied", "Lien copié dans le presse-papiers"), "success");
    }).catch(() => {
      toast(get("classContent.linkFallback", "Lien : {url}").replace("{url}", url), "success");
    });
  };

  const effectiveMatiere = matiere || course?.matiere || "—";

  const refreshContents = () => {
    void load(true);
  };

  const retryLoad = () => {
    void load(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => {
          // Navigate back to the parent course tab; close self first to avoid id races.
          const selfId = tabs.activeId;
          tabs.open({ kind: "course", title: course?.name || "Cours", params: { courseId } });
          if (selfId) tabs.close(selfId);
        }}
        className="text-mute flex items-center gap-1.5 hover:text-primary transition-colors w-fit"
      >
        <ArrowRightIcon className="w-4 h-4 rotate-180" /> {get("classContent.back", "Retour au cours")}
      </button>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display-sm text-display-sm tracking-tight text-primary">
            {get("classContent.title", "Contenu — {class}").replace("{class}", className)}
          </h1>
        </div>
        <button
          onClick={refreshContents}
          className="new-btn-ghost flex items-center gap-1.5"
          disabled={loading || isRefreshing}
        >
          <RefreshIcon
            className={`w-4 h-4 ${(loading || isRefreshing) ? "animate-spin" : ""}`}
          />
          {loading || isRefreshing ? "Rafraîchissement..." : "Rafraîchir"}
        </button>
      </header>

      {lastRefresh && (
        <p className="text-[11px] text-mute mt-1">
          Dernier rafraîchissement : {lastRefresh.toLocaleTimeString()}
          {isRefreshing && " (actualisation…)"}
        </p>
      )}

      {error && (
        <div className="new-card p-4 border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          {error}
          <div className="mt-2">
            <button className="new-btn-ghost text-xs" onClick={retryLoad}>Réessayer</button>
          </div>
        </div>
      )}

      {loading && contents.length === 0 ? (
        <div className="new-card">
          <Loading label={`Chargement du contenu Pronote pour la classe ${className}…`} />
        </div>
      ) : contents.length === 0 && !error ? (
        <div className="new-card p-6">
          <EmptyState
            icon={<BookIcon className="w-8 h-8" />}
            title="Aucun contenu Pronote récent"
            hint={`Aucun "contenu des cours" trouvé pour ${className} / ${effectiveMatiere}. Vérifiez que le prof est connecté (compte professeur) et a publié des contenus dans le cahier de textes sur Pronote pour cette classe et matière.`}
          />
        </div>
      ) : (
        <div className={`space-y-4 ${loading || isRefreshing ? "opacity-60" : ""}`}>
          {contents.map((c, idx) => (
            <div
              key={idx}
              className="new-card border-l-2 border-[rgba(15,0,0,0.18)] p-4 border border-[rgba(15,0,0,0.12)]"
            >
              <div className="flex items-start gap-4">
                {/* Distinctive date rail */}
                <div className="w-[94px] shrink-0 text-[11px] font-mono text-mute pt-0.5 tabular-nums bg-[var(--eu-surface-soft)]/60 -m-1 p-1 rounded">
                  {c.date_label || c.date?.slice(0, 10)}
                  <div className="text-[10px] text-mute/80">{c.start_time}–{c.end_time}</div>
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  {/* Title + category — more prominent */}
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <BookIcon className="w-4 h-4 text-mute shrink-0" />
                    <span className="font-semibold text-[15px] text-primary leading-tight">
                      {c.title || "(sans titre)"}
                    </span>
                    {c.category && (
                      <span className="eu-chip text-[10px] py-px tracking-wide">
                        {c.category}
                      </span>
                    )}
                    {c.subject && c.subject !== effectiveMatiere && (
                      <span className="text-[10px] text-mute">({c.subject})</span>
                    )}
                  </div>

                  {/* Description — the actual lesson content */}
                  {c.description && (
                    <p className="text-[13px] text-on-surface leading-relaxed">
                      {c.description}
                    </p>
                  )}

                  {/* Meta */}
                  {c.groups && (
                    <div className="text-[11px] text-mute">
                      Groupes : {c.groups}
                    </div>
                  )}

                  {/* Documents — now a distinctive attachment block */}
                  {c.documents && c.documents.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[rgba(15,0,0,0.1)]">
                      <div className="text-[10px] uppercase tracking-[0.5px] text-mute mb-1.5">
                        Documents joints ({c.documents.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {c.documents.map((d, di) => (
                          <div
                            key={di}
                            className="flex items-center gap-1.5 text-xs bg-[var(--eu-surface-soft)] border border-[rgba(15,0,0,0.12)] rounded px-2 py-1 max-w-full"
                          >
                            <DocIcon className="w-3.5 h-3.5 text-mute shrink-0" />
                            {d.url ? (
                              <button
                                onClick={() => {
                                  if (!d.url) return;
                                  api.openUrl(d.url).catch(() => {});
                                  if (!isTauri()) {
                                    // fallback to open in browser when running in plain Vite dev (no Tauri)
                                    window.open(d.url, '_blank');
                                  }
                                }}
                                className="truncate font-medium max-w-[220px] text-left hover:underline hover:text-primary focus:outline-none"
                                title="Ouvrir dans le navigateur"
                              >
                                {d.name}
                              </button>
                            ) : (
                              <span className="truncate font-medium max-w-[220px]">{d.name}</span>
                            )}
                            {d.url && (
                              <button
                                onClick={() => copyUrl(d.url)}
                                className="new-btn-ghost text-[10px] px-1.5 py-px ml-1"
                                title="Copier le lien direct Pronote"
                              >
                                copier
                              </button>
                            )}
                            <span className="text-[10px] text-mute/70 ml-1">
                              {d.type === 1 ? "fichier" : "lien"}
                            </span>
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
    </div>
  );
}
