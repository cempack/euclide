import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { q } from "../api/queries";
import type { RecapData } from "../lib/api";
import { tr } from "../lib/i18n";
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
  CodeIcon,
  BellIcon,
} from "../components/icons";
import { EmptyState, Loading } from "../components/ui";
import { MetaDot, PageHeader, Panel, Segmented, StatStrip, StatTile } from "../components/layout";
import { humanMinutes } from "../lib/format";

// Bilan (ex-Recap) of time spent in the app + most used documents/tools (based on activity events). Only detailed activity stats live here.
type Period = "today" | "week" | "month";

const PERIOD_LABELS: Record<Period, string> = {
  today: tr("recap.todayLabel"),
  week: tr("recap.weekLabel"),
  month: tr("recap.monthLabel"),
};

type BarRow = { key: string; label: string; value: number; icon?: React.ReactNode; text: string };

/**
 * One ranked bar list. The four breakdowns below (areas, matières, documents,
 * outils) are the same widget with different rows, so they share one component
 * rather than four near-identical blocks of markup.
 */
function BarList({ title, hint, rows }: { title: string; hint?: string; rows: BarRow[] }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return (
    <Panel
      title={title}
      action={hint ? <span className="eu-t-label">{hint}</span> : undefined}
      pad
      bodyClassName="flex flex-col gap-2.5"
    >
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2.5">
          {r.icon && <span className="shrink-0 w-4 text-ink-faint">{r.icon}</span>}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="eu-t-body text-ink truncate">{r.label}</span>
              <span className="eu-t-meta eu-t-num shrink-0">{r.text}</span>
            </div>
            <div className="eu-gauge mt-1.5">
              <i style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            </div>
          </div>
        </div>
      ))}
    </Panel>
  );
}

export default function Recap() {
  // The backend keeps 30 days of events; only the day view was ever surfaced.
  const [period, setPeriod] = useState<Period>("today");
  const recapQ = useQuery(q.recap(period));
  const data: RecapData | null = recapQ.data ?? null;
  const loading = recapQ.isPending;

  const stats = data
    ? [
        {
          icon: <FileIcon className="w-5 h-5" />,
          value: data.files_opened,
          label: tr("recap.stats.filesOpened"),
        },
        {
          icon: <PenIcon className="w-5 h-5" />,
          value: data.notes_written,
          label: tr("recap.stats.notesWritten"),
        },
        {
          icon: <PlayIcon className="w-5 h-5" />,
          value: data.demos_run,
          label: tr("recap.stats.demosRun"),
        },
        {
          icon: <CheckIcon className="w-5 h-5" />,
          value: data.reminders_done,
          label: tr("recap.stats.remindersDone"),
        },
        {
          icon: <ClockIcon className="w-5 h-5" />,
          value: data.active_minutes,
          label: tr("recap.stats.activeMinutes"),
        },
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
    python: { label: "Python", icon: <CodeIcon className="w-4 h-4" /> },
    whiteboard: { label: "Tableau blanc", icon: <PenIcon className="w-4 h-4" /> },
    pdf: { label: "PDFs", icon: <DocIcon className="w-4 h-4" /> },
    note: { label: "Notes", icon: <PenIcon className="w-4 h-4" /> },
    reminders: { label: "Rappels", icon: <BellIcon className="w-4 h-4" /> },
    settings: { label: "Réglages", icon: <GearIcon className="w-4 h-4" /> },
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
  const totalAreaMinutes =
    timeByArea.reduce((sum: number, a: { minutes: number }) => sum + a.minutes, 0) || 1;

  // Build highlights client-side so all text comes from the central JSON (src/locales/strings.json)
  const highlights: string[] = [];
  if (data) {
    if (data.files_opened > 0) {
      highlights.push(tr("recap.highlightFiles", { count: data.files_opened }));
    }
    if (data.notes_written > 0) {
      highlights.push(
        tr("recap.highlightNotes", {
          count: data.notes_written,
        }),
      );
    }
    if (data.top_courses?.length > 0) {
      const top = data.top_courses[0];
      highlights.push(tr("recap.highlightTopCourse", { name: top.name }));
    }
    if (data.top_documents?.length > 0) {
      const top = data.top_documents[0];
      highlights.push(tr("recap.highlightTopDoc", { name: top.name }));
    }
    if (data.top_tools?.length > 0) {
      const top = data.top_tools[0];
      highlights.push(tr("recap.highlightTopTool", { name: top.name }));
    }
    if (data.reminders_done > 0) {
      highlights.push(
        tr("recap.highlightReminders", {
          count: data.reminders_done,
        }),
      );
    }
    if (highlights.length === 0) {
      highlights.push(tr("recap.highlightEmpty"));
    }
  }

  return (
    <>
      <PageHeader
        title={tr("nav.recap")}
        icon={<SparkleIcon className="w-5 h-5" />}
        meta={
          <>
            <span>{PERIOD_LABELS[period]}</span>
            <MetaDot />
            <span>{tr("recap.subtitle")}</span>
          </>
        }
        actions={
          <Segmented
            value={period}
            onChange={setPeriod}
            label={tr("recap.period")}
            options={[
              { value: "today", label: tr("recap.today") },
              { value: "week", label: tr("recap.week") },
              { value: "month", label: tr("recap.month") },
            ]}
          />
        }
      />

      {loading ? (
        <Panel>
          <Loading label={tr("recap.loading")} />
        </Panel>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Total time for the period. */}
          <StatStrip>
            <StatTile
              icon={<ClockIcon className="w-4 h-4" />}
              value={
                totalMin >= 60 ? `${hours}\u00a0h\u00a0${String(mins).padStart(2, "0")}` : `${mins}\u00a0min`
              }
              label={tr("recap.activityTime")}
              hint={PERIOD_LABELS[period]}
            />
            {stats.map((s) => (
              <StatTile key={s.label} icon={s.icon} value={s.value} label={s.label} />
            ))}
          </StatStrip>

          <BarList
            title={tr("recap.timeByArea")}
            hint={tr("recap.timeByAreaHint")}
            rows={timeByArea.map((a) => ({
              key: a.key,
              label: a.label,
              icon: a.icon,
              value: a.minutes,
              text: `${humanMinutes(a.minutes)} · ${Math.round((a.minutes / totalAreaMinutes) * 100)} %`,
            }))}
          />

          <BarList
            title={tr("recap.bySubject")}
            hint={tr("recap.basedOnActivity")}
            rows={(data?.top_courses || []).map((c) => ({
              key: c.name,
              label: c.name,
              icon: <BookIcon className="w-4 h-4" />,
              value: c.count,
              text: humanMinutes(c.count),
            }))}
          />

          <BarList
            title={tr("recap.byDocuments")}
            hint={tr("recap.basedOnActivity")}
            rows={(data?.top_documents || []).map((d) => ({
              key: d.name,
              label: d.name,
              icon: <DocIcon className="w-4 h-4" />,
              value: d.count,
              text: tr("recap.opens", { count: d.count }),
            }))}
          />

          <BarList
            title={tr("recap.byTools")}
            hint={tr("recap.basedOnActivity")}
            rows={(data?.top_tools || []).map((tool) => ({
              key: tool.name,
              label: tool.name,
              icon: <ToolIcon className="w-4 h-4" />,
              value: tool.count,
              text: tr("recap.uses", { count: tool.count }),
            }))}
          />

          {totalMin > 0 && highlights.length > 0 && (
            <Panel title={tr("recap.highlights")} icon={<SparkleIcon className="w-4 h-4" />}>
              <ul className="eu-divide">
                {highlights.map((h, i) => (
                  <li key={i} className="eu-row eu-t-body text-ink">
                    {h}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {(!data || totalMin === 0) && (
            <Panel>
              <EmptyState
                icon={<ClockIcon className="w-4 h-4" />}
                title={tr("recap.noDataTitle")}
                hint={tr("recap.noData")}
              />
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
