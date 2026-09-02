import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, type RecapData } from "../lib/api";
import { t, fmt } from "../lib/i18n";
import {
  BookIcon,
  ClockIcon,
  DocIcon,
  FileIcon,
  GearIcon,
  HomeIcon,
  PenIcon,
  PlayIcon,
  CheckIcon,
  SparkleIcon,
  ToolIcon,
} from "../components/icons";
import { Loading } from "../components/ui";

// Bilan (ex-Recap) of time spent in the app + most used documents/tools (based on activity events). Only detailed activity stats live here.
export default function Recap() {
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    // Daily view (per user request). Data retained for 30 days in backend.
    api.getRecap("today").then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const stats = data
    ? [
        { icon: <FileIcon className="w-5 h-5" />, value: data.files_opened, label: t.recap?.stats?.filesOpened || "fichiers ouverts" },
        { icon: <PenIcon className="w-5 h-5" />, value: data.notes_written, label: t.recap?.stats?.notesWritten || "notes écrites" },
        { icon: <PlayIcon className="w-5 h-5" />, value: data.demos_run, label: t.recap?.stats?.demosRun || "démos lancées" },
        { icon: <CheckIcon className="w-5 h-5" />, value: data.reminders_done, label: t.recap?.stats?.remindersDone || "rappels faits" },
        { icon: <ClockIcon className="w-5 h-5" />, value: data.active_minutes, label: t.recap?.stats?.activeMinutes || "minutes actives" },
      ]
    : [];

  const totalMin = data?.active_minutes ?? 0;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  // Map raw area keys (tab kinds + labels from ticks) to friendly labels + icons for the "where time was spent" breakdown.
  const AREA_META: Record<string, { label: string; icon: React.ReactNode }> = {
    dashboard: { label: "Tableau de bord", icon: <HomeIcon className="w-4 h-4" /> },
    courses: { label: "Cours", icon: <BookIcon className="w-4 h-4" /> },
    course: { label: "Détail cours", icon: <BookIcon className="w-4 h-4" /> },
    "class-content": { label: "Contenu de classe", icon: <BookIcon className="w-4 h-4" /> },
    documents: { label: "Documents", icon: <DocIcon className="w-4 h-4" /> },
    tools: { label: "Outils & démos", icon: <ToolIcon className="w-4 h-4" /> },
    recap: { label: "Bilan", icon: <SparkleIcon className="w-4 h-4" /> },
    python: { label: "Python", icon: <ToolIcon className="w-4 h-4" /> },
    whiteboard: { label: "Tableau blanc", icon: <PenIcon className="w-4 h-4" /> },
    pdf: { label: "PDFs", icon: <DocIcon className="w-4 h-4" /> },
    settings: { label: "Réglages", icon: <GearIcon className="w-4 h-4" /> },
    reminders: { label: "Rappels", icon: <CheckIcon className="w-4 h-4" /> },
    note: { label: "Notes", icon: <PenIcon className="w-4 h-4" /> },
    app: { label: "Application", icon: <ClockIcon className="w-4 h-4" /> },
  };

  const timeByArea = (data?.time_by_area || []).map((a: any) => {
    const meta = AREA_META[a.name] || { label: a.name, icon: <ClockIcon className="w-4 h-4" /> };
    return {
      key: a.name,
      label: meta.label,
      minutes: a.count,
      icon: meta.icon,
    };
  });
  const totalAreaMinutes = timeByArea.reduce((sum: number, a: { minutes: number }) => sum + a.minutes, 0) || 1;
  const maxAreaMin = timeByArea[0]?.minutes || 1;

  // Build highlights client-side so all text comes from the central JSON (src/locales/strings.json)
  const highlights: string[] = [];
  if (data) {
    if (data.files_opened > 0) {
      highlights.push(fmt(t.recap?.highlightFiles || "Vous avez ouvert {count} fichier(s).", { count: data.files_opened }));
    }
    if (data.notes_written > 0) {
      highlights.push(fmt(t.recap?.highlightNotes || "{count} nouvelle(s) note(s) préparée(s).", { count: data.notes_written }));
    }
    if (data.top_courses?.length > 0) {
      const top = data.top_courses[0];
      highlights.push(fmt(t.recap?.highlightTopCourse || "Cours le plus actif : {name}.", { name: top.name }));
    }
    if (data.top_documents?.length > 0) {
      const top = data.top_documents[0];
      highlights.push(fmt(t.recap?.highlightTopDoc || "Document le plus consulté : {name}.", { name: top.name }));
    }
    if (data.top_tools?.length > 0) {
      const top = data.top_tools[0];
      highlights.push(fmt(t.recap?.highlightTopTool || "Outil le plus utilisé : {name}.", { name: top.name }));
    }
    if (data.reminders_done > 0) {
      highlights.push(fmt(t.recap?.highlightReminders || "{count} rappel(s) accompli(s). Bravo !", { count: data.reminders_done }));
    }
    if (highlights.length === 0) {
      highlights.push(t.recap?.highlightEmpty || "Rien d'enregistré pour cette période. Bonne classe !");
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="font-display-sm text-display-sm tracking-tight text-primary">{t.nav?.recap || "Bilan"}</h1>
        <p className="text-body-mute text-sm mt-1">{t.recap?.subtitle || "Temps passé dans l'application."}</p>
      </header>

      {loading ? (
        <div className="new-card">
          <Loading label={t.recap?.loading || "Chargement de l'activité…"} />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Activity hero - clean, on-brand card (no more dark island) */}
          <div className="new-card p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[1.5px] text-mute mb-2">
              <ClockIcon className="w-4 h-4" /> {t.recap?.today || "AUJOURD'HUI"}
            </div>

            <div className="flex items-baseline gap-x-2">
              <span className="text-[52px] leading-none font-semibold tabular-nums tracking-[-2px] text-primary">{hours}</span>
              <span className="text-3xl text-mute">h</span>
              <span className="text-[52px] leading-none font-semibold tabular-nums tracking-[-2px] text-primary">{mins}</span>
              <span className="text-3xl text-mute">min</span>
            </div>
            <div className="mt-0.5 text-sm text-body-mute">{t.recap?.activityTime || "Temps d'activité"}</div>

            <div className="mt-3 text-xs text-body-mute">
              Temps d'utilisation aujourd'hui
            </div>

            {/* Daily usage meter (like Screen Time daily goal) */}
            <div className="mt-3 h-1 bg-surface-container rounded-full overflow-hidden">
              <div
                className="h-full bg-tui-accent/70 rounded-full transition-[width]"
                style={{ width: `${Math.min(100, Math.max(2, (totalMin / (4 * 60)) * 100))}%` }}
              />
            </div>
          </div>

          {/* Where the time has actually been spent — the main request */}
          {timeByArea.length > 0 && (
            <section className="new-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-on-surface font-semibold text-[15px]">{t.recap?.timeByArea || "Où le temps a été passé"}</h2>
                <span className="text-[10px] text-body-mute">{t.recap?.timeByAreaHint || "basé sur le temps d'utilisation"}</span>
              </div>
              <div className="flex flex-col gap-2">
                {timeByArea.map((a: any, i: number) => {
                  const pct = Math.round((a.minutes / maxAreaMin) * 100);
                  const h = Math.floor(a.minutes / 60);
                  const m = a.minutes % 60;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="shrink-0 text-mute w-5">{a.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="text-primary font-medium truncate">{a.label}</span>
                          <span className="tabular-nums text-body-mute shrink-0 ml-3 text-xs">
                            {h}h {m}min <span className="text-mute">({Math.round((a.minutes / totalAreaMinutes) * 100)}%)</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-surface-container overflow-hidden">
                          <div
                            className="h-full rounded-full bg-tui-accent transition-[width] duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Activity stats (compact) — only meaningful once we have data */}
          {totalMin > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="new-card p-4 transition-transform hover:-translate-y-px"
                >
                  <span className="grid place-items-center w-8 h-8 rounded-lg bg-surface-container text-tui-accent mb-2">
                    {s.icon}
                  </span>
                  <p className="font-display-sm text-2xl text-primary tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-body-mute">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {data && data.top_courses?.length > 0 && (
            <section className="new-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-on-surface font-semibold text-[15px]">{t.recap?.bySubject || "Temps par matière"}</h2>
                <span className="text-[10px] text-body-mute">{t.recap?.basedOnActivity || "basé sur l'activité"}</span>
              </div>
              <div className="flex flex-col gap-3">
                {data.top_courses.map((c: any, _i: number) => {
                  const max = data.top_courses[0].count || 1;
                  return (
                    <div key={c.name} className="flex items-center gap-3">
                      <BookIcon className="w-5 h-5 shrink-0 text-mute" />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm">
                          <span className="text-primary font-medium truncate">{c.name}</span>
                          <span className="text-body-mute tabular-nums text-xs">{Math.floor(c.count / 60)}h {c.count % 60}min</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-surface-container overflow-hidden">
                          <div
                            className="h-full rounded-full bg-tui-accent transition-[width] duration-300 ease-out"
                            style={{ width: `${(c.count / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Top documents (most opened / time proxy via opens) */}
          {data && data.top_documents?.length > 0 && (
            <section className="new-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-on-surface font-semibold text-[15px]">{t.recap?.byDocuments || "Documents les plus consultés"}</h2>
                <span className="text-[10px] text-body-mute">{t.recap?.basedOnActivity || "basé sur l'activité"}</span>
              </div>
              <div className="flex flex-col gap-3">
                {data.top_documents.map((d: any, _i: number) => {
                  const max = data.top_documents[0].count || 1;
                  return (
                    <div key={d.name} className="flex items-center gap-3">
                      <DocIcon className="w-5 h-5 shrink-0 text-mute" />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm">
                          <span className="text-primary font-medium truncate">{d.name}</span>
                          <span className="text-body-mute tabular-nums">{d.count}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-surface-container overflow-hidden">
                          <div
                            className="h-full rounded-full bg-tui-accent transition-[width] duration-300 ease-out"
                            style={{ width: `${(d.count / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Top tools (demos etc.) */}
          {data && data.top_tools?.length > 0 && (
            <section className="new-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-on-surface font-semibold text-[15px]">{t.recap?.byTools || "Outils les plus utilisés"}</h2>
                <span className="text-[10px] text-body-mute">{t.recap?.basedOnActivity || "basé sur l'activité"}</span>
              </div>
              <div className="flex flex-col gap-3">
                {data.top_tools.map((tool: any, i: number) => {
                  const max = data.top_tools[0].count || 1;
                  return (
                    <div key={tool.name} className="flex items-center gap-3">
                      <ToolIcon className="w-5 h-5 shrink-0 text-mute" />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm">
                          <span className="text-primary font-medium truncate">{tool.name}</span>
                          <span className="text-body-mute tabular-nums">{tool.count}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-surface-container overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-tui-accent"
                            initial={{ width: 0 }}
                            animate={{ width: `${(tool.count / max) * 100}%` }}
                            transition={{ delay: 0.05 + i * 0.03, duration: 0.35, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Insights / highlights */}
          {highlights.length > 0 && (
            <section className="flex flex-col gap-2">
              {highlights.map((h, i) => (
                <div
                  key={i}
                  className="new-card p-4 flex items-center gap-3 text-sm opacity-0 animate-fade-in"
                  style={{ animationDelay: `${80 + i * 20}ms` }}
                >
                  <SparkleIcon className="w-5 h-5 text-tui-accent shrink-0" />
                  <p className="text-primary">{h}</p>
                </div>
              ))}
            </section>
          )}

          {(!data || totalMin === 0) && (
            <div className="text-center text-body-mute text-sm py-4">{t.recap?.noData || "Pas encore assez de données cette semaine. Revenez après quelques sessions !"}</div>
          )}
        </div>
      )}
    </div>
  );
}
