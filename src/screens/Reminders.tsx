import { useEffect, useState, useMemo } from "react";
import { api, type Reminder } from "../lib/api";
import { t } from "../lib/i18n";
import { useToast } from "../components/ui";
import { BellIcon, CheckIcon, TrashIcon, PlusIcon, SearchIcon } from "../components/icons";
import { formatDueLabel } from "../lib/format";
import { notifyPendingReminders } from "../lib/notify";

export default function Reminders() {
  const toast = useToast();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "done">("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Create form state (upgraded inline form)
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await api.listReminders();
      setReminders(list);
    } catch {
      // silent
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("eu:reminders-changed", onChange);
    return () => window.removeEventListener("eu:reminders-changed", onChange);
  }, []);

  const addReminder = async () => {
    if (!newTitle.trim()) return;
    try {
      const due = newDue ? new Date(newDue).toISOString() : null;
      await api.createReminder(newTitle.trim(), due);
      toast(t.dashboard?.toastReminderAdded || "Rappel ajouté", "success");
      setNewTitle("");
      setNewDue("");
      window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
      refresh();
    } catch {
      toast(t.dashboard?.toastReminderAddError || "Impossible d'ajouter le rappel", "error");
    }
  };

  const setQuickDue = (days: number | null) => {
    if (days === null) {
      setNewDue("");
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + days);
    setNewDue(d.toISOString().slice(0, 10));
  };

  const toggle = async (r: Reminder) => {
    const markingDone = !r.done;
    await api.toggleReminder(r.id, markingDone);
    if (markingDone) {
      api.logEvent("reminder_done", r.title, null);
      const cheers: string[] = (t.dashboard?.cheers as string[] | undefined)?.length
        ? (t.dashboard?.cheers as string[])
        : ["Bien joué !", "Un de fait ✓", "Nickel !"];
      toast(cheers[Math.floor(Math.random() * cheers.length)], "success");
    }
    window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
    refresh();
  };

  const deleteOne = async (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(t.dashboard?.confirmDeleteReminder || "Supprimer ce rappel ?")) return;
    try {
      await api.deleteReminder(id);
      window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
      refresh();
    } catch {
      toast(t.dashboard?.errorDeleteReminder || "Erreur lors de la suppression", "error");
    }
  };

  const clearDone = async () => {
    const done = reminders.filter((r) => r.done);
    if (done.length === 0) return;
    if (!confirm(`Supprimer les ${done.length} rappels terminés ?`)) return;
    for (const r of done) {
      try {
        await api.deleteReminder(r.id);
      } catch {}
    }
    window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
    refresh();
  };

  const notifyNow = async () => {
    await notifyPendingReminders();
    toast("Notifications envoyées pour les rappels en attente.", "success");
  };

  const filtered = useMemo(() => {
    let list = [...reminders];
    if (filter === "pending") list = list.filter((r) => !r.done);
    if (filter === "done") list = list.filter((r) => r.done);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((r) => r.title.toLowerCase().includes(q));
    }
    // sort: pending first by due, then done by created desc-ish
    list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!a.due_at && !b.due_at) return b.created_at.localeCompare(a.created_at);
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return a.due_at.localeCompare(b.due_at);
    });
    return list;
  }, [reminders, filter, search]);

  const pendingCount = reminders.filter((r) => !r.done).length;
  const doneCount = reminders.filter((r) => r.done).length;

  return (
    <div className="max-w-[960px] mx-auto flex flex-col gap-8 pb-12 font-mono">
      <header>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display-sm text-display-sm tracking-tight text-primary flex items-center gap-2">
              <BellIcon className="w-6 h-6" /> {t.nav?.reminders || "Rappels"}
            </h1>
            <p className="text-mute text-sm mt-1">Gérez vos tâches et échéances. Restez au top.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-surface-soft border border-hairline text-mute tabular-nums">{pendingCount} à faire</span>
            <span className="px-2 py-0.5 rounded bg-surface-soft border border-hairline text-mute tabular-nums">{doneCount} terminés</span>
          </div>
        </div>
      </header>

      {/* Create form — clean, breathing, no dense templates/examples */}
      <div className="new-card p-5">
        <div className="text-sm font-medium text-primary mb-4 flex items-center gap-2">
          <PlusIcon className="w-4 h-4" /> Nouveau rappel
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            autoFocus
            className="new-input flex-1"
            placeholder={t.dashboard?.reminderTitlePlaceholder || "Titre du rappel"}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addReminder();
            }}
          />
          <button
            onClick={addReminder}
            disabled={!newTitle.trim()}
            className="new-btn-primary bg-primary text-white px-5 whitespace-nowrap"
          >
            {t.dashboard?.addReminderBtn || "Ajouter"}
          </button>
        </div>

        {/* Due section — separated for breathing */}
        <div className="border-t mt-4 pt-4">
          <p className="text-mute text-xs mb-2 font-mono">{t.dashboard?.dueQuickLabel || "Échéance rapide"}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button type="button" onClick={() => setQuickDue(0)} className="text-xs px-3 py-1 rounded border border-hairline hover:bg-surface-soft hover:border-hairline font-mono">{t.dashboard?.dueToday || "Aujourd'hui"}</button>
            <button type="button" onClick={() => setQuickDue(1)} className="text-xs px-3 py-1 rounded border border-hairline hover:bg-surface-soft hover:border-hairline font-mono">{t.dashboard?.dueTomorrow || "Demain"}</button>
            <button type="button" onClick={() => setQuickDue(3)} className="text-xs px-3 py-1 rounded border border-hairline hover:bg-surface-soft hover:border-hairline font-mono">{t.dashboard?.dueIn3Days || "+3 jours"}</button>
            <button type="button" onClick={() => setQuickDue(7)} className="text-xs px-3 py-1 rounded border border-hairline hover:bg-surface-soft hover:border-hairline font-mono">{t.dashboard?.dueInWeek || "Dans 1 sem"}</button>
            <button type="button" onClick={() => setQuickDue(null)} className="text-xs px-3 py-1 rounded border border-hairline text-mute hover:bg-surface-soft font-mono">{t.dashboard?.dueNone || "Aucune"}</button>
          </div>
          <input
            type="date"
            className="new-input w-full sm:w-auto text-sm"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
          />
        </div>
      </div>

      {/* Controls: search + filters + actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <input
            className="new-input pl-9 w-full"
            placeholder="Rechercher un rappel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SearchIcon className="w-4 h-4 absolute left-3 top-3 text-mute" />
        </div>

        <div className="flex gap-1.5 text-sm">
          <button onClick={() => setFilter("pending")} className={`px-3 py-1 rounded border font-mono text-xs ${filter === "pending" ? "bg-primary text-white border-primary" : "border-hairline text-mute hover:bg-surface-soft"}`}>À faire ({pendingCount})</button>
          <button onClick={() => setFilter("done")} className={`px-3 py-1 rounded border font-mono text-xs ${filter === "done" ? "bg-primary text-white border-primary" : "border-hairline text-mute hover:bg-surface-soft"}`}>Terminés ({doneCount})</button>
          <button onClick={() => setFilter("all")} className={`px-3 py-1 rounded border font-mono text-xs ${filter === "all" ? "bg-primary text-white border-primary" : "border-hairline text-mute hover:bg-surface-soft"}`}>Tous</button>
        </div>

        <div className="flex gap-2">
          <button onClick={notifyNow} className="new-btn-ghost text-xs flex items-center gap-1" title="Envoyer une notification système pour les rappels en attente">
            <BellIcon className="w-3.5 h-3.5" /> Notifier
          </button>
          {doneCount > 0 && (
            <button onClick={clearDone} className="new-btn-ghost text-xs text-mute hover:text-red-600">Effacer terminés</button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="new-card p-8 text-center text-mute">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="new-card p-8 text-center">
          <div className="text-mute/70 mb-2"><BellIcon className="w-8 h-8 mx-auto" /></div>
          <p className="text-mute">{search ? "Aucun résultat pour la recherche." : "Rien à afficher pour ce filtre."}</p>
        </div>
      ) : (
        <div className="new-card divide-y divide-hairline/60 overflow-hidden">
          {filtered.map((r) => {
            const due = formatDueLabel(r.due_at);
            const isDone = r.done;
            return (
              <div key={r.id} className={`flex items-center gap-4 px-4 py-4 group transition-colors ${isDone ? "bg-surface-soft/40" : "hover:bg-surface-soft"}`}>
                <button
                  onClick={() => toggle(r)}
                  className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition ${isDone ? "bg-emerald-600 border-emerald-600 text-white" : "border-hairline text-mute hover:border-tui-accent hover:text-tui-accent"}`}
                  title={isDone ? "Marquer à faire" : "Marquer fait"}
                >
                  {isDone ? <CheckIcon className="w-3.5 h-3.5" /> : <span className="w-2 h-2 rounded-full bg-current" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className={`font-medium truncate ${isDone ? "line-through text-mute" : "text-primary"}`}>{r.title}</div>
                  {r.due_at && (
                    <div className="text-[10px] text-mute mt-0.5 font-mono">{new Date(r.due_at).toLocaleDateString("fr-FR")}</div>
                  )}
                </div>

                {due.text && (
                  <span
                    className={`text-[10px] px-1.5 py-px rounded border font-mono tabular-nums shrink-0 ${due.tone === "over" ? "text-red-700 border-red-200 bg-red-50" : due.tone === "soon" ? "text-orange-700 border-orange-200 bg-orange-50" : "text-mute border-hairline"}`}
                  >
                    {due.text}
                  </span>
                )}

                <button
                  onClick={(e) => deleteOne(r.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-mute hover:text-red-600 transition-all shrink-0"
                  title="Supprimer"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
