import { useQueryClient } from "@tanstack/react-query";
import { changed } from "../../api/client";
import { q } from "../../api/queries";
import { useToast } from "../../components/ui";
import { api, type Reminder } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { cheer } from "../../lib/format";
import { tr } from "../../lib/i18n";
import { logged, reportError } from "../../lib/report";

/**
 * Ticking and deleting a reminder, the same on every screen: the list
 * changes at once, and the toast offers to undo. A recurring reminder that
 * is ticked moves to its next date instead (the backend decides, the list
 * follows), so it has nothing to undo.
 */
export function useReminderActions() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const patch = (update: (list: Reminder[]) => Reminder[]) =>
    queryClient.setQueryData(q.reminders().queryKey, (prev) => update(prev ?? []));

  const setDone = async (r: Reminder, done: boolean) => {
    const optimistic = r.repeat_rule === "none" || !r.due_at;
    if (optimistic) patch((list) => list.map((x) => (x.id === r.id ? { ...x, done } : x)));
    try {
      await api.toggleReminder(r.id, done);
      changed("reminders");
      return true;
    } catch (err) {
      reportError("reminders.toggle", err);
      if (optimistic) patch((list) => list.map((x) => (x.id === r.id ? { ...x, done: !done } : x)));
      toast(errorMessage(err, tr("messages.genericError")), "error");
      return false;
    }
  };

  const toggle = async (r: Reminder) => {
    const done = !r.done;
    if (!(await setDone(r, done)) || !done) return;
    api.logEvent("reminder_done", r.title, r.course_id);
    const undoable = r.repeat_rule === "none" || !r.due_at;
    toast(
      cheer(),
      "success",
      undoable
        ? { action: { label: tr("common.undo"), run: () => void setDone({ ...r, done }, false) } }
        : undefined,
    );
  };

  /** Puts a deleted reminder back (as a new one: same title, date, course, repeat). */
  const restore = async (r: Reminder) => {
    const back = await api.createReminder(r.title, r.due_at, r.course_id, r.repeat_rule);
    if (r.done && back?.id) await api.toggleReminder(back.id, true);
    changed("reminders");
  };

  const remove = async (r: Reminder) => {
    patch((list) => list.filter((x) => x.id !== r.id));
    try {
      await api.deleteReminder(r.id);
      changed("reminders");
      toast(tr("reminders.deleted", { name: r.title }), "info", {
        action: { label: tr("common.undo"), run: () => void restore(r).catch(logged("reminders.restore")) },
      });
    } catch (err) {
      reportError("reminders.delete", err);
      changed("reminders");
      toast(errorMessage(err, tr("dashboard.errorDeleteReminder")), "error");
    }
  };

  /** New title and date, at once in the list. */
  const edit = async (r: Reminder, title: string, dueAt: string | null) => {
    patch((list) => list.map((x) => (x.id === r.id ? { ...x, title, due_at: dueAt } : x)));
    try {
      await api.updateReminder(r.id, title, dueAt, r.course_id, r.repeat_rule);
    } catch (err) {
      reportError("reminders.edit", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
    changed("reminders");
  };

  return { toggle, remove, edit };
}
