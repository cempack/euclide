import { useEffect, useState, useMemo } from "react";
import { useTabs } from "../lib/tabs";
import {
  api,
  type AppInfo,
  type Course,
  type FileItem,
  type Note,
  type QuickLink,
  type Reminder,
  type ScheduleEntry,
  type RecapData,
} from "../lib/api";
import { t, get, fmt } from "../lib/i18n";
import { getClassStatus, findNextClassIndex, minutesUntil, formatDueLabel, relativeTime, greeting } from "../lib/format";
import { COURSE_ICONS, useToast } from "../components/ui";
import { BookIcon, NoteIcon, CalendarIcon, ScheduleIcon, DescriptionIcon, TrashIcon, CheckIcon, FileKindIcon } from "../components/icons";
import { Favicon } from "../components/Favicon";


export default function Dashboard({ info: _info }: { info?: AppInfo | null }) {
  const tabs = useTabs();
  const toast = useToast();
  const [classes, setClasses] = useState<ScheduleEntry[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [pronoteStatus, setPronoteStatus] = useState<any>(null);
  const [keepAwakeOn, setKeepAwakeOn] = useState(true); // default on (backend now starts with screen keep-awake enabled)
  const [recap, setRecap] = useState<RecapData | null>(null);



  // live tick so current/upcoming times + progress bar update without full refresh
  const [nowTick, setNowTick] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  // touch to satisfy TS (causes re-render of schedule computations)
  void nowTick;

  const refresh = () => {
    api.getTodayClasses().then(setClasses).catch(() => {});
    api.listReminders().then(setReminders).catch(() => {});
    api.allNotes().then(setNotes).catch(() => {});
    api.listCourses().then(setCourses).catch(() => {});
    api.listFiles(null).then((f) => setDocCount(f.length)).catch(() => {});
    api.listLinks().then(setLinks).catch(() => {});
    api.recentFiles(5).then(setRecentFiles).catch(() => {});
    api.pronoteStatus().then(setPronoteStatus).catch(() => {});
    api.keepAwakeStatus().then((s) => setKeepAwakeOn(!!s)).catch(() => {});
    api.getRecap("today").then(setRecap).catch(() => {});
  };

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("eu:library-changed", onChange);
    window.addEventListener("eu:quicklinks-changed", onChange);
    window.addEventListener("eu:schedule-changed", onChange);
    window.addEventListener("eu:reminders-changed", onChange);
    return () => {
      window.removeEventListener("eu:library-changed", onChange);
      window.removeEventListener("eu:quicklinks-changed", onChange);
      window.removeEventListener("eu:schedule-changed", onChange);
      window.removeEventListener("eu:reminders-changed", onChange);
    };
  }, []);

  const toggle = async (r: Reminder) => {
    const markingDone = !r.done;
    await api.toggleReminder(r.id, markingDone);
    if (markingDone) {
      api.logEvent("reminder_done", r.title, null);
      const cheers: string[] = (t.dashboard?.cheers && t.dashboard.cheers.length) ? t.dashboard.cheers : ["Bien joué !"];
      toast(cheers[Math.floor(Math.random() * cheers.length)], "success");
    }
    refresh();
    window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
  };

  const deleteReminder = async (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(t.dashboard?.confirmDeleteReminder || "Supprimer ce rappel ?")) return;
    try {
      await api.deleteReminder(id);
      refresh();
      window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
    } catch {
      toast(t.dashboard?.errorDeleteReminder || "Erreur lors de la suppression", "error");
    }
  };

  const pending = reminders.filter((r) => !r.done);

  // Helper to open a recent file (surfaces PDF annotator, whiteboards, etc.)
  const openRecent = (f: FileItem) => {
    if (f.kind === "board") {
      tabs.open({ kind: "whiteboard", title: f.name, params: { fileId: f.id } });
    } else if (f.kind === "pdf" || f.kind === "image") {
      tabs.open({ kind: "pdf", title: f.name, params: { fileId: f.id, fileName: f.name } });
    } else {
      api.openFile(f.id);
    }
  };

  const syncPronote = async () => {
    try {
      await api.pronoteSync();
      toast(get("settings.toastSyncCount", "{count} cours").replace("{count}", "OK"), "success");
      refresh();
    } catch {
      toast(get("settings.toastSyncFail", "Sync impossible"), "error");
    }
  };

  const toggleKeepAwake = async () => {
    try {
      const next = !!(await api.setKeepAwake(!keepAwakeOn));
      setKeepAwakeOn(next);
      toast(next ? (t.tools?.keepAwakeOn || "L'écran reste allumé") : (t.tools?.keepAwakeOff || "Verrouillage écran normal"), next ? "success" : "info");
    } catch {
      toast(get("messages.genericError", "Erreur"), "error");
    }
  };

  // Memoized schedule items (avoids re-compute + IIFE on every nowTick / re-render)
  const scheduleItems = useMemo(() => {
    if (classes.length === 0) return null;
    const nextIdx = findNextClassIndex(classes);
    return classes.slice(0, 6).map((c, i) => {
      const status = getClassStatus(c);
      const isCurrent = status === "current";
      const isNext = i === nextIdx && !isCurrent;
      const mins = !isCurrent ? minutesUntil(c.start_time) : null;
      const sMin = parseInt(c.start_time, 10) * 60 + parseInt(c.start_time.split(":")[1] || "0", 10);
      const eMin = parseInt(c.end_time, 10) * 60 + parseInt(c.end_time.split(":")[1] || "0", 10);
      const curMin = new Date().getHours() * 60 + new Date().getMinutes();
      const progress = isCurrent && eMin > sMin ? Math.max(0, Math.min(100, ((curMin - sMin) / (eMin - sMin)) * 100)) : 0;

      return (
        <div
          key={i}
          className={`flex items-start gap-3 px-3 py-2.5 rounded mb-1 last:mb-0 border transition-all ${
            isCurrent ? "bg-[#fff7ed] border-[#fed7aa]" : isNext ? "bg-[#f8fafc] border-[#e2e8f0]" : status === "past" ? "opacity-60 border-transparent" : "border-transparent hover:bg-[#f8fafc]"
          }`}
        >
          <div className="pt-1 shrink-0">
            <div className={`w-2 h-2 rounded-full mt-1 ${isCurrent ? "bg-[#f97316]" : isNext ? "bg-[#fb923c]" : "bg-[#d1d5db]"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 text-[13px]">
              <span className="font-mono text-[#666] w-[78px] shrink-0 tabular-nums">{c.start_time}–{c.end_time}</span>
              <span className="font-medium text-[#222] truncate">{c.subject}</span>
              {c.room && <span className="text-[10px] px-1.5 py-px rounded bg-white border border-[#e5e5e5] text-[#666] tabular-nums">{c.room}</span>}
              {status === "past" && <span className="ml-auto text-[9px] px-1.5 py-px rounded border border-[#e5e5e5] text-[#888] tabular-nums">passé</span>}
            </div>

            <div className="mt-0.5 text-[10px] font-mono flex items-center gap-2">
              {isCurrent && (
                <>
                  <span className="font-semibold text-[#ea580c]">[EN COURS]</span>
                  <div className="flex-1 h-px bg-[#fed7aa]" />
                  <span className="text-[#c2410c] tabular-nums">{Math.round(progress)}%</span>
                </>
              )}
              {isNext && <span className="text-[#c2410c] font-medium">{mins ? `DANS ${mins} MIN` : "PROCHAIN"}</span>}
              {status === "upcoming" && !isNext && <span className="text-[#888]">à venir</span>}
            </div>

            {isCurrent && (
              <div className="mt-1 h-1 bg-[#fed7aa] rounded overflow-hidden">
                <div className="h-1 bg-[#f97316] transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </div>
      );
    });
  }, [classes, nowTick]); // include nowTick so progress bars and "dans X min" update live every 30s without full component churn (the items JSX recomputes cheaply)

  return (
    <div className="max-w-[960px] mx-auto flex flex-col gap-8 pb-12 font-mono">
      {/* Hero title — matches the provided mock exactly ("Une nouvelle page, un nouveau cours.") */}
      <div className="pt-2">
        <h1 className="font-display-xl text-[42px] leading-[1.05] tracking-[-1.2px] text-primary">
          {greeting()} — tableau de bord.
        </h1>
      </div>

      {/* Stats row — inspired by the mock (light cards, icon circles, big nums, small caps labels).
          These are simple inventory overviews. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => tabs.open({ kind: "courses" })}
          className="bg-[#f4f4f4] border border-[#e8e8e8] rounded-2xl p-5 flex items-center gap-4 cursor-pointer active:scale-[0.985] transition-all hover:border-[#d0d0d0]"
        >
          <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-[#666] ring-1 ring-inset ring-[#e8e8e8]">
            <BookIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[34px] font-semibold tabular-nums tracking-[-1px] text-[#1f1f1f] leading-none">{courses.length}</div>
            <div className="text-[10px] font-mono tracking-[2px] text-[#777] mt-0.5">COURS</div>
          </div>
        </div>

        <div
          onClick={() => tabs.open({ kind: "documents" })}
          className="bg-[#f4f4f4] border border-[#e8e8e8] rounded-2xl p-5 flex items-center gap-4 cursor-pointer active:scale-[0.985] transition-all hover:border-[#d0d0d0]"
        >
          <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-[#666] ring-1 ring-inset ring-[#e8e8e8]">
            <DescriptionIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[34px] font-semibold tabular-nums tracking-[-1px] text-[#1f1f1f] leading-none">{docCount}</div>
            <div className="text-[10px] font-mono tracking-[2px] text-[#777] mt-0.5">DOCUMENTS</div>
          </div>
        </div>

        <div
          onClick={() => tabs.open({ kind: "documents" })}
          className="bg-[#f4f4f4] border border-[#e8e8e8] rounded-2xl p-5 flex items-center gap-4 cursor-pointer active:scale-[0.985] transition-all hover:border-[#d0d0d0]"
        >
          <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-[#666] ring-1 ring-inset ring-[#e8e8e8]">
            <NoteIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[34px] font-semibold tabular-nums tracking-[-1px] text-[#1f1f1f] leading-none">{notes.length}</div>
            <div className="text-[10px] font-mono tracking-[2px] text-[#777] mt-0.5">NOTES</div>
          </div>
        </div>
      </div>

      <section>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => tabs.open({ kind: "courses" })} className="new-btn shrink-0">
            <span className="text-secondary">[+]</span> {t.common?.newCourse || "Nouveau cours"}
          </button>
          <button onClick={() => tabs.open({ kind: "whiteboard", title: t.dashboard?.newTabWhiteboard || "Nouveau tableau", params: { isNew: true } })} className="new-btn shrink-0">
            <span className="text-secondary">[+]</span> {t.common?.whiteboard || "Tableau blanc"}
          </button>
          <button onClick={() => tabs.open({ kind: "reminders" })} className="new-btn shrink-0">
            <span className="text-secondary">[+]</span> {t.common?.newReminder || "Nouveau rappel"}
          </button>
          <button onClick={() => tabs.open({ kind: "note", title: t.common?.newNote || "Nouvelle note", params: { isNew: true } })} className="new-btn shrink-0">
            <span className="text-secondary">[+]</span> {t.common?.newNote || "Nouvelle note"}
          </button>
          <button
            onClick={async () => {
              try {
                const added = await api.importFiles(null);
                const count = Array.isArray(added) ? added.length : 0;
                toast(fmt(get("messages.imported", "{count} importé(s)"), { count }), "success");
                window.dispatchEvent(new CustomEvent("eu:library-changed"));
              } catch {
                toast(get("messages.importError", "Import impossible (sélection annulée ?)"), "error");
              }
            }}
            className="new-btn shrink-0"
          >
            <span className="text-secondary">[+]</span> {t.common?.importFiles || "Importer des fichiers"}
          </button>
          <button onClick={() => tabs.open({ kind: "python" })} className="new-btn shrink-0">
            <span className="text-secondary">[+]</span> Python
          </button>
        </div>
      </section>

      {/* Main two widgets — schedule + rappels (core daily use, matching the mock structure & empty states) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Les cours d'aujourd'hui — rich status, progress, live tick (kept from previous, styled clean) */}
        <div className="bg-white border border-[#e8e8e8] rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-hairline bg-surface-soft flex items-center justify-between text-sm">
            <div className="font-medium text-primary">Les cours d'aujourd'hui</div>
            <div className="text-[10px] px-2 py-0.5 rounded border border-hairline text-mute tabular-nums flex items-center gap-1">
              <ScheduleIcon className="w-3.5 h-3.5" /> {classes.length}
            </div>
          </div>

          {classes.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-soft">
              <CalendarIcon className="w-9 h-9 text-ash mb-3" />
              <p className="text-mute text-sm">{t.dashboard?.noClassesToday || "Aucun cours prévu aujourd'hui. Profitez du calme."}</p>
            </div>
          ) : (
            <div className="flex-1 p-2 text-sm bg-[rgb(var(--eu-card))]">
              {scheduleItems}
            </div>
          )}
        </div>

        {/* Rappels — clean list + empty state matching mock */}
        <div className="bg-white border border-[#e8e8e8] rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-hairline bg-surface-soft flex items-center justify-between text-sm">
            <div className="font-medium text-primary">Rappels</div>
            <button onClick={() => tabs.open({ kind: "reminders" })} className="w-6 h-6 rounded border border-hairline flex items-center justify-center text-mute hover:text-primary hover:bg-surface-soft active:bg-surface-container text-xs">+</button>
          </div>

          {pending.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface-soft">
              <p className="text-mute text-sm">{t.dashboard?.noReminders || "Aucun rappel."}</p>
            </div>
          ) : (
            <ul className="flex-1 p-2 text-sm bg-[rgb(var(--eu-card))]">
              {pending.slice(0, 6).map((r, i) => {
                const due = formatDueLabel(r.due_at);
                const isOver = due.tone === "over";
                const isSoon = due.tone === "soon";
                return (
                  <li key={i} className="group flex items-center gap-2 px-3 py-2 rounded hover:bg-surface-soft border border-transparent hover:border-hairline">
                    <button onClick={() => toggle(r)} className="text-emerald-600 hover:scale-110 active:scale-95 transition-transform shrink-0">
                      <CheckIcon className="w-4 h-4" />
                    </button>
                    <span className="truncate flex-1 text-primary">{r.title}</span>
                    {due.text && (
                      <span className={`text-[10px] px-1.5 py-px rounded border font-mono tabular-nums shrink-0 ${isOver ? "text-red-700 border-red-200 bg-red-50" : isSoon ? "text-orange-700 border-orange-200 bg-orange-50" : "text-mute border-hairline"}`}>
                        {due.text}
                      </span>
                    )}
                    <button onClick={(e) => deleteReminder(r.id, e)} className="opacity-0 group-hover:opacity-100 text-mute hover:text-red-600 active:text-red-600 transition-all" title={get("common.delete", "Supprimer")}>
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Additional widgets — "everything the app does" surfaced on the dashboard. Quick links now own category. Added recap activity + keep-awake from tools + python entry point. */}
      <div>
        <div className="uppercase tracking-[1.5px] text-[11px] text-[#666] mb-2 font-mono">{get("dashboard.quickLinks", "Liens")}</div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Mes cours widget */}
          <div className="bg-white border border-[#e8e8e8] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-primary">Mes cours</div>
              <button onClick={() => tabs.open({ kind: "courses" })} className="text-[10px] text-[#666] hover:text-primary">voir tout →</button>
            </div>
            {courses.length === 0 ? (
              <div className="text-xs text-[#777] py-3">Créez votre premier cours pour organiser notes, casiers et progressions par classe.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {courses.slice(0, 6).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => tabs.open({ kind: "course", title: c.name, params: { courseId: c.id } })}
                    className="text-left px-3 py-1 rounded-lg border border-[#e5e5e5] hover:border-[#ccc] active:scale-[0.985] transition text-sm flex items-center gap-2 max-w-[170px]"
                    style={{ background: `${c.color}15` }}
                  >
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: c.color }} />
                    {(() => {
                      const found = COURSE_ICONS.find((i) => i.key === (c.emoji || "book"));
                      const IconComp = found ? found.Icon : BookIcon;
                      return <IconComp className="w-3.5 h-3.5 text-[#444]" strokeWidth={1.8} />;
                    })()}
                    <span className="truncate flex-1 min-w-0 text-[#222]">{c.name}</span>
                    {c.matiere && <span className="text-[9px] px-1 rounded bg-white/70 text-[#666] flex-shrink-0">{c.matiere === 'Mathématiques' ? 'Math' : c.matiere === 'Maths expertes' ? 'Maths+' : c.matiere.slice(0,4)}</span>}
                  </button>
                ))}
                {courses.length > 6 && (
                  <span className="text-xs self-center text-[#777]">+{courses.length - 6}</span>
                )}
              </div>
            )}
          </div>

          {/* Fichiers récents — surfaces the document library + PDF/whiteboard viewers */}
          <div className="bg-white border border-[#e8e8e8] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-primary">Récents</div>
              <button onClick={() => tabs.open({ kind: "documents" })} className="text-[10px] text-[#666] hover:text-primary">bibliothèque →</button>
            </div>
            {recentFiles.length === 0 ? (
              <div className="text-xs text-[#777] py-3">Importez des PDF, images ou tableaux. Ils apparaîtront ici.</div>
            ) : (
              <div className="space-y-0.5 text-sm">
                {recentFiles.map((f: FileItem) => (
                  <button
                    key={f.id}
                    onClick={() => openRecent(f)}
                    className="w-full text-left flex items-center gap-2 px-2 py-1 rounded hover:bg-[#f8fafc] active:bg-[#f1f5f9] text-[#222] group"
                    title={f.name}
                  >
                    <FileKindIcon kind={f.kind} className="w-4 h-4 text-[#888]" />
                    <span className="truncate flex-1 text-[13px]">{f.name}</span>
                    <span className="text-[9px] text-[#999] tabular-nums shrink-0 opacity-80 group-hover:opacity-100">{relativeTime(f.added_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Liens rapides — now its own category (extracted from Outils, dedicated card) */}
          <div className="bg-white border border-[#e8e8e8] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-primary">Liens rapides</div>
              <button onClick={() => tabs.open({ kind: "tools" })} className="text-[10px] text-[#666] hover:text-primary">gérer →</button>
            </div>
            {links.length === 0 ? (
              <div className="text-xs text-[#777] py-3">Ajoutez des liens (sites, manuels, ENT…) depuis Outils pour un accès direct.</div>
            ) : (
              <div className="grid grid-cols-1 gap-1 text-sm">
                {links.slice(0, 6).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => api.openUrl(l.url)}
                    className="w-full text-left flex items-center gap-2 px-2 py-1 rounded hover:bg-[#f8fafc] active:bg-[#f1f5f9] text-[#222]"
                  >
                    <Favicon url={l.url} className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Outils & Pronote — quick access, pronote status, keep-awake toggle + activity recap from everywhere */}
          <div className="bg-white border border-[#e8e8e8] rounded-2xl p-4">
            <div className="text-sm font-medium text-primary mb-2">Outils &amp; Pronote</div>

            <div className="flex flex-wrap gap-2 text-sm">
              <button onClick={() => tabs.open({ kind: "tools" })} className="px-3 py-1 rounded border border-[#e5e5e5] hover:bg-[#f8fafc] active:scale-[0.985]">Ouvrir Outils</button>
              <button onClick={() => tabs.open({ kind: "python" })} className="px-3 py-1 rounded border border-[#e5e5e5] hover:bg-[#f8fafc] active:scale-[0.985]">Python</button>
              <button onClick={() => tabs.open({ kind: "whiteboard", params: { isNew: true } })} className="px-3 py-1 rounded border border-[#e5e5e5] hover:bg-[#f8fafc] active:scale-[0.985]">Nouveau tableau</button>
            </div>

            {pronoteStatus && (
              <div className="mt-3 pt-3 border-t border-[#f0f0f0] text-xs flex items-center gap-2">
                {pronoteStatus.connected ? (
                  <>
                    <span className="inline-block w-2 h-2 rounded-full bg-[#16a34a]" />
                    <span className="text-[#16a34a]">Pronote connecté</span>
                    <button onClick={syncPronote} className="ml-auto text-[10px] px-2 py-0.5 rounded border border-[#d1d5db] hover:bg-white">Sync</button>
                  </>
                ) : (
                  <span className="text-[#888]">Pronote non connecté (QR ou identifiants dans Réglages)</span>
                )}
              </div>
            )}

            {/* Keep awake toggle (from Tools) */}
            <div className="mt-2 pt-2 border-t border-[#f0f0f0] flex items-center justify-between text-xs">
              <span className="text-mute">Veille écran</span>
              <button
                onClick={toggleKeepAwake}
                className={`px-2 py-0.5 rounded border text-[10px] transition ${keepAwakeOn ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#e5e5e5] hover:bg-[#f8fafc]"}`}
              >
                {keepAwakeOn ? "Désactivée" : "Auto"}
              </button>
            </div>

            {/* Mini activity recap pulled from Recap (everywhere usage) */}
            {recap && (
              <div className="mt-2 pt-2 border-t border-[#f0f0f0] text-[10px] text-[#666] flex flex-wrap gap-x-3 gap-y-0.5">
                <span>{recap.files_opened || 0} fichiers</span>
                <span>{recap.notes_written || 0} notes</span>
                <span>{recap.reminders_done || 0} rappels</span>
                <span>{recap.demos_run || 0} scripts</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}