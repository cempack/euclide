import { useState, useMemo, useCallback, memo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { q } from "../api/queries";
import { api, type Course, type Reminder, type RepeatRule } from "../lib/api";
import { tr, trn } from "../lib/i18n";
import { errorMessage } from "../lib/errors";
import { reportError } from "../lib/report";
import { useToast, useConfirm, Loading, EmptyState } from "../components/ui";
import { Field, MetaDot, PageHeader, Panel, Segmented } from "../components/layout";
import { courseVisual } from "../lib/color";
import { useAppearance } from "../lib/theme";
import { BellIcon, CheckIcon, RepeatIcon, TrashIcon, PlusIcon, SearchIcon } from "../components/icons";
import { formatDueLabel, localYmd, localYmdToIso, cheer } from "../lib/format";

const NO_REMINDERS: Reminder[] = [];
const NO_COURSES: Course[] = [];

const REPEAT_LABELS: Record<RepeatRule, string> = {
  none: tr("reminders.repeatNone"),
  daily: tr("reminders.repeatDaily"),
  weekly: tr("reminders.repeatWeekly"),
  monthly: tr("reminders.repeatMonthly"),
};

/**
 * A reminder row. Actions appear on hover *and* on keyboard focus, which the
 * previous version did not do — the delete button was unreachable by keyboard.
 */
const ReminderRow = memo(function ReminderRow({
  r,
  course,
  dark,
  onToggle,
  onDelete,
}: {
  r: Reminder;
  course?: Course;
  dark: boolean;
  onToggle: (r: Reminder) => void;
  onDelete: (id: number) => void;
}) {
  const due = formatDueLabel(r.due_at);
  const isDone = r.done;
  return (
    <div className={`eu-row group ${isDone ? "bg-panel-alt/50" : "hover:bg-panel-alt"}`}>
      <button
        onClick={() => onToggle(r)}
        aria-pressed={isDone}
        aria-label={`${isDone ? tr("reminders.markTodo") : tr("reminders.markDone")} — ${r.title}`}
        data-tip={isDone ? tr("reminders.markTodo") : tr("reminders.markDone")}
        className={`shrink-0 w-5 h-5 grid place-items-center rounded-sm border transition-colors duration-fast ${
          isDone
            ? "bg-ok-solid border-ok-solid text-panel"
            : "border-line-strong hover:border-ok hover:bg-ok-soft"
        }`}
      >
        {isDone && <CheckIcon className="w-3 h-3" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`eu-t-body truncate ${isDone ? "line-through text-ink-faint" : "text-ink"}`}>
          {r.title}
        </p>
        {(course || r.repeat_rule !== "none") && (
          <p className="eu-t-meta flex items-center gap-2 mt-0.5">
            {course && (
              <span className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ background: courseVisual(course.color, dark).fg }}
                />
                <span className="truncate">{course.name}</span>
              </span>
            )}
            {r.repeat_rule !== "none" && (
              <span className="flex items-center gap-1">
                <RepeatIcon className="w-3 h-3" />
                {REPEAT_LABELS[r.repeat_rule]}
              </span>
            )}
          </p>
        )}
      </div>

      {due.text && (
        <span
          className={
            due.tone === "over" ? "eu-chip-danger" : due.tone === "soon" ? "eu-chip-warn" : "eu-chip"
          }
        >
          {due.text}
        </span>
      )}

      <button
        onClick={() => onDelete(r.id)}
        aria-label={`${tr("common.delete")} — ${r.title}`}
        data-tip={tr("common.delete")}
        className="eu-row-actions eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

export default function Reminders() {
  const toast = useToast();
  const confirm = useConfirm();
  const { resolved } = useAppearance();

  const queryClient = useQueryClient();
  const remindersQ = useQuery(q.reminders());
  const reminders = remindersQ.data ?? NO_REMINDERS;
  const loading = remindersQ.isPending;
  const courses = useQuery(q.courses()).data ?? NO_COURSES;
  /** Optimistic edits write the shared cache; the next refetch confirms them. */
  const setReminders = (update: (prev: Reminder[]) => Reminder[]) =>
    queryClient.setQueryData(q.reminders().queryKey, (prev) => update(prev ?? []));
  const [filter, setFilter] = useState<"pending" | "done" | "all">("pending");
  const [search, setSearch] = useState("");

  // Create form: one line, with the details folded away until needed.
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newCourse, setNewCourse] = useState<number | "">("");
  const [newRepeat, setNewRepeat] = useState<RepeatRule>("none");
  const [showDetails, setShowDetails] = useState(false);

  // After a change: refetch the list (other screens follow through the cache).
  const refresh = (_opts?: { silent?: boolean }) =>
    void queryClient.invalidateQueries({ queryKey: q.reminders().queryKey });

  const addReminder = async () => {
    if (!newTitle.trim()) return;
    try {
      const due = newDue ? localYmdToIso(newDue) : null;
      const created = await api.createReminder(
        newTitle.trim(),
        due,
        newCourse === "" ? null : Number(newCourse),
        newRepeat,
      );
      if (!created?.id) {
        toast(tr("dashboard.toastReminderAddError"), "error");
        return;
      }
      toast(tr("dashboard.toastReminderAdded"), "success");
      setNewTitle("");
      setNewDue("");
      setNewRepeat("none");
      window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
      refresh({ silent: true });
    } catch (err) {
      reportError("reminders.add", err);
      toast(errorMessage(err, tr("dashboard.toastReminderAddError")), "error");
    }
  };

  const setQuickDue = (days: number | null) => {
    setNewDue(days === null ? "" : localYmd(new Date(), days));
  };

  const toggle = useCallback(
    async (r: Reminder) => {
      const markingDone = !r.done;
      // A recurring reminder rolls forward instead of being closed, so we let
      // the backend decide and refetch rather than guessing locally.
      const optimistic = r.repeat_rule === "none" || !r.due_at;
      if (optimistic) {
        setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, done: markingDone } : x)));
      }
      try {
        await api.toggleReminder(r.id, markingDone);
        if (markingDone) {
          api.logEvent("reminder_done", r.title, r.course_id);
          toast(cheer(), "success");
        }
        window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
        if (!optimistic) refresh({ silent: true });
      } catch (err) {
        reportError("reminders.toggle", err);
        if (optimistic) {
          setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, done: !markingDone } : x)));
        }
        toast(errorMessage(err, tr("messages.genericError")), "error");
      }
    },
    [toast, refresh],
  );

  const deleteOne = useCallback(
    async (id: number) => {
      const ok = await confirm.ask({
        title: tr("dashboard.confirmDeleteReminder"),
        message: tr("dashboard.confirmDeleteReminder"),
        confirmLabel: tr("common.delete"),
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteReminder(id);
        window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
        refresh({ silent: true });
      } catch (err) {
        reportError("reminders.delete", err);
        toast(errorMessage(err, tr("dashboard.errorDeleteReminder")), "error");
      }
    },
    [toast, confirm, refresh],
  );

  const clearDone = async () => {
    const done = reminders.filter((r) => r.done);
    if (done.length === 0) return;
    const ok = await confirm.ask({
      title: tr("reminders.clearDoneTitle"),
      message: trn("reminders.clearDoneMessage", done.length),
      confirmLabel: tr("common.delete"),
      danger: true,
    });
    if (!ok) return;
    for (const r of done) {
      try {
        await api.deleteReminder(r.id);
      } catch (err) {
        // keep going: one failure should not abort the sweep
        reportError("reminders.clearDone", err);
      }
    }
    window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
    refresh({ silent: true });
  };

  const filtered = useMemo(() => {
    let list = [...reminders];
    if (filter === "pending") list = list.filter((r) => !r.done);
    if (filter === "done") list = list.filter((r) => r.done);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((r) => r.title.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!a.due_at && !b.due_at) return b.created_at.localeCompare(a.created_at);
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return a.due_at.localeCompare(b.due_at);
    });
    return list;
  }, [reminders, filter, search]);

  /** Buckets by urgency — the answer to "what do I have to do today?". */
  const groups = useMemo(() => {
    const buckets: Array<{ key: string; label: string; items: Reminder[] }> = [
      { key: "over", label: tr("reminders.groupOver"), items: [] },
      { key: "soon", label: tr("reminders.groupSoon"), items: [] },
      { key: "later", label: tr("reminders.groupLater"), items: [] },
      { key: "nodate", label: tr("reminders.groupNoDate"), items: [] },
      { key: "done", label: tr("reminders.groupDone"), items: [] },
    ];
    const by = (k: string) => buckets.find((b) => b.key === k)!;
    for (const r of filtered) {
      if (r.done) by("done").items.push(r);
      else if (!r.due_at) by("nodate").items.push(r);
      else {
        const tone = formatDueLabel(r.due_at).tone;
        by(tone === "over" ? "over" : tone === "soon" ? "soon" : "later").items.push(r);
      }
    }
    return buckets.filter((b) => b.items.length > 0);
  }, [filtered]);

  const pendingCount = reminders.filter((r) => !r.done).length;
  const doneCount = reminders.filter((r) => r.done).length;
  const courseById = (id: number | null) => courses.find((c) => c.id === id);

  return (
    <>
      <PageHeader
        title={tr("nav.reminders")}
        icon={<BellIcon className="w-5 h-5" />}
        meta={
          <>
            <span>{tr("reminders.metaPending", { count: pendingCount })}</span>
            <MetaDot />
            <span>{trn("reminders.metaDone", doneCount)}</span>
          </>
        }
        actions={
          doneCount > 0 ? (
            <button onClick={clearDone} className="eu-btn-quiet eu-btn-sm hover:text-danger">
              <TrashIcon className="w-3.5 h-3.5" />
              {tr("reminders.clearDone")}
            </button>
          ) : undefined
        }
      />

      <Panel pad>
        <div className="flex gap-2">
          <input
            autoFocus
            className="eu-input flex-1"
            placeholder={tr("dashboard.reminderTitlePlaceholder")}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addReminder();
            }}
            aria-label={tr("dashboard.reminderTitlePlaceholder")}
          />
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="eu-btn-ghost eu-btn-sm"
          >
            {showDetails ? tr("reminders.hideDetails") : tr("reminders.showDetails")}
          </button>
          <button onClick={addReminder} disabled={!newTitle.trim()} className="eu-btn-primary eu-btn-sm">
            <PlusIcon className="w-3.5 h-3.5" />
            {tr("dashboard.addReminderBtn")}
          </button>
        </div>

        {showDetails && (
          <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3.5 mt-4 pt-4 border-t border-line">
            <Field label={tr("dashboard.dueQuickLabel")}>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <button type="button" onClick={() => setQuickDue(0)} className="eu-btn-ghost eu-btn-sm">
                  {tr("dashboard.dueToday")}
                </button>
                <button type="button" onClick={() => setQuickDue(1)} className="eu-btn-ghost eu-btn-sm">
                  {tr("dashboard.dueTomorrow")}
                </button>
                <button type="button" onClick={() => setQuickDue(7)} className="eu-btn-ghost eu-btn-sm">
                  {tr("dashboard.dueInWeek")}
                </button>
                {newDue && (
                  <button type="button" onClick={() => setQuickDue(null)} className="eu-btn-quiet eu-btn-sm">
                    {tr("dashboard.dueNone")}
                  </button>
                )}
              </div>
              <input
                type="date"
                className="eu-input"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                aria-label={tr("dashboard.dueQuickLabel")}
              />
            </Field>

            <Field label={tr("reminders.course")}>
              <select
                className="eu-select"
                value={newCourse}
                onChange={(e) => setNewCourse(e.target.value === "" ? "" : Number(e.target.value))}
                aria-label={tr("reminders.course")}
              >
                <option value="">{tr("reminders.noCourse")}</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label={tr("reminders.repeat")}
              hint={newRepeat !== "none" && !newDue ? tr("reminders.repeatNeedsDate") : undefined}
            >
              <select
                className="eu-select"
                value={newRepeat}
                onChange={(e) => setNewRepeat(e.target.value as RepeatRule)}
                aria-label={tr("reminders.repeat")}
              >
                {(Object.keys(REPEAT_LABELS) as RepeatRule[]).map((k) => (
                  <option key={k} value={k}>
                    {REPEAT_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Panel>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <input
            className="eu-input pl-8"
            placeholder={tr("common.search") + "…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={tr("common.search")}
          />
          <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          label={tr("reminders.filter")}
          options={[
            { value: "pending", label: `${tr("reminders.todo")} (${pendingCount})` },
            { value: "done", label: `${tr("reminders.groupDone")} (${doneCount})` },
            { value: "all", label: tr("reminders.all") },
          ]}
        />
      </div>

      {loading ? (
        <Panel>
          <Loading label={tr("common.loading")} />
        </Panel>
      ) : groups.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<BellIcon className="w-4 h-4" />}
            title={search ? tr("reminders.noResult") : tr("reminders.emptyTitle")}
            hint={search ? tr("reminders.noResultHint") : tr("reminders.emptyHint")}
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-2">
              <p className="eu-t-label">
                {g.label} · {g.items.length}
              </p>
              <Panel>
                <div className="eu-divide">
                  {g.items.map((r) => (
                    <ReminderRow
                      key={r.id}
                      r={r}
                      course={courseById(r.course_id)}
                      dark={resolved === "dark"}
                      onToggle={toggle}
                      onDelete={deleteOne}
                    />
                  ))}
                </div>
              </Panel>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
