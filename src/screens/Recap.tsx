import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { q } from "../api/queries";
import type { RecapData } from "../lib/api";
import { get, tr, trn } from "../lib/i18n";
import { BookOpen, Check, Clock, File, FileText, Play, Sparkles, Wrench } from "lucide-react";
import { Icon } from "../ui/Icon";
import { EmptyState, Loading } from "../components/ui";
import { Duration, MetaDot, PageHeader, Panel, Segmented, StatTile } from "../components/layout";
import { humanMinutes } from "../lib/format";
import { KIND_ICONS } from "../shell/nav";
import type { TabKind } from "../stores/tabs";

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
          icon: <Icon icon={File} size={20} />,
          value: data.files_opened,
          label: tr("recap.stats.filesOpened"),
        },
        {
          icon: <Icon icon={KIND_ICONS.note} size={20} />,
          value: data.notes_written,
          label: tr("recap.stats.notesWritten"),
        },
        {
          icon: <Icon icon={Play} size={20} />,
          value: data.demos_run,
          label: tr("recap.stats.demosRun"),
        },
        {
          icon: <Icon icon={Check} size={20} />,
          value: data.reminders_done,
          label: tr("recap.stats.remindersDone"),
        },
      ]
    : [];

  const totalMin = data?.active_minutes ?? 0;

  // Where the time went, by screen (tab kinds, plus « app » for the rest),
  // each with the icon it has in the sidebar and the tabs.
  const timeByArea = (data?.time_by_area || []).map((a) => ({
    key: a.name,
    label:
      a.name in KIND_ICONS || a.name === "app" ? (get(`recap.areas.${a.name}`, a.name) as string) : a.name,
    minutes: a.count,
    icon: <Icon icon={KIND_ICONS[a.name as TabKind] ?? Clock} size={16} />,
  }));
  const totalAreaMinutes =
    timeByArea.reduce((sum: number, a: { minutes: number }) => sum + a.minutes, 0) || 1;

  // Build highlights client-side so all text comes from the central JSON (src/locales/strings.json)
  const highlights: string[] = [];
  if (data) {
    if (data.files_opened > 0) {
      highlights.push(trn("recap.highlightFiles", data.files_opened));
    }
    if (data.notes_written > 0) {
      highlights.push(trn("recap.highlightNotes", data.notes_written));
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
      highlights.push(trn("recap.highlightReminders", data.reminders_done));
    }
    if (highlights.length === 0) {
      highlights.push(tr("recap.highlightEmpty"));
    }
  }

  return (
    <>
      <PageHeader
        title={tr("nav.recap")}
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
          {/* The time for the period, then what was done in it. */}
          <div className="eu-panel eu-recap-stats">
            <div className="eu-recap-hero">
              <span className="eu-t-label flex items-center gap-1.5">
                <Icon icon={Clock} size={14} />
                {tr("recap.activityTime")}
              </span>
              <span className="eu-recap-time">
                <Duration minutes={totalMin} />
              </span>
              <span className="eu-t-meta">{PERIOD_LABELS[period]}</span>
            </div>
            {stats.map((s) => (
              <StatTile key={s.label} icon={s.icon} value={s.value} label={s.label} />
            ))}
          </div>

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
              icon: <Icon icon={BookOpen} size={16} />,
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
              icon: <Icon icon={FileText} size={16} />,
              value: d.count,
              text: trn("recap.opens", d.count),
            }))}
          />

          <BarList
            title={tr("recap.byTools")}
            hint={tr("recap.basedOnActivity")}
            rows={(data?.top_tools || []).map((tool) => ({
              key: tool.name,
              label: tool.name,
              icon: <Icon icon={Wrench} size={16} />,
              value: tool.count,
              text: trn("recap.uses", tool.count),
            }))}
          />

          {totalMin > 0 && highlights.length > 0 && (
            <Panel title={tr("recap.highlights")} icon={<Icon icon={Sparkles} size={16} />}>
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
                icon={<Icon icon={Clock} size={16} />}
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
