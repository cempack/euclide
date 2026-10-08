import { lazy, Suspense, useEffect, useRef, useState, useCallback } from "react";
import { changed } from "../api/client";
import { flushSync } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ClipboardCheck, FileDown, Presentation, Printer } from "lucide-react";
import { Icon } from "../ui/Icon";
import { MenuButton } from "../ui/Menu";
import { q } from "../api/queries";
import { openFile } from "../lib/files";
import { useActiveId } from "../stores/tabs";
import { tabs } from "../stores/tabs";
import { editors } from "../stores/editors";
import { api, isTauri, type Course, type Note } from "../lib/api";
import { useToast, useConfirm, Loading } from "./ui";
import { CodeXml, Link as LinkGlyph, Trash2 } from "lucide-react";
import { tr } from "../lib/i18n";
import { Segmented, Toolbar, ToolGroup, ToolSep, ToolSpacer } from "./layout";
import { useSetting } from "../api/hooks";
import { isMac } from "../lib/shortcuts";
import { keysOf, useShortcut } from "../lib/keymap";
import { tip } from "../ui/Tooltip";
import { relativeTime } from "../lib/format";
import { errorMessage } from "../lib/errors";
import { logged, reportError } from "../lib/report";
import { Markdown } from "../features/notes/Markdown";
import { PrintSheet, printDialog, sheetReady, type PrintJob } from "../features/notes/PrintSheet";
import { TemplateMenu, TemplateStrip } from "../features/notes/TemplatePicker";
import { fillTemplate, type NoteTemplate } from "../features/notes/templates";

interface NoteEditorProps {
  tabId: string;
  noteId?: number;
  isNew?: boolean;
  initialCourseId?: number;
}

type NoteView = "edit" | "split" | "preview";

const Slides = lazy(() => import("../features/notes/SlideShow"));

export default function NoteEditor({ tabId, noteId, isNew, initialCourseId }: NoteEditorProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [draft, setDraft] = useState<Partial<Note> & { id?: number }>({
    title: tr("notes.newTitle"),
    body: "",
    course_id: initialCourseId ?? null,
  });
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewBody, setPreviewBody] = useState("");
  const loggedWrite = useRef(false);

  // The refs are the source of truth for saving: they are updated synchronously
  // on every edit, so a save that resolves mid-typing sees the latest draft.
  const draftRef = useRef(draft);
  const dirtyRef = useRef(dirty);
  const commitDraft = useCallback((next: Partial<Note> & { id?: number }) => {
    draftRef.current = next;
    setDraft(next);
  }, []);
  const commitDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  }, []);

  // Link popup state
  // Source, preview or both side by side (stacked when the pane is narrow).
  const [savedView, setView] = useSetting("note_view");
  const view: NoteView = savedView === "edit" || savedView === "preview" ? savedView : "split";
  const [linkPopupOpen, setLinkPopupOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const active = useActiveId() === tabId;
  useShortcut("present", () => setPresenting(true), active);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [linkTextInput, setLinkTextInput] = useState("");
  const [linkUrlInput, setLinkUrlInput] = useState("https://");
  const [linkSelection, setLinkSelection] = useState<{ start: number; end: number } | null>(null);

  // Load courses and note data
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cs = await api.listCourses();
        if (!mounted) return;
        setCourses(Array.isArray(cs) ? cs : []);

        if (noteId) {
          if (draftRef.current.id === noteId) {
            if (mounted) setLoading(false);
            return;
          }
          const found = await api.getNote(noteId);
          if (found && mounted) {
            commitDraft(found);
            setPreviewBody(found.body || "");
            commitDirty(false);
          }
        } else if (isNew) {
          // new note, preselect if initial
          commitDraft({
            title: tr("notes.newTitle"),
            body: "",
            course_id: initialCourseId ?? null,
          });
          commitDirty(false);
        }
      } catch (err) {
        reportError("note.load", err);
        toast(errorMessage(err, tr("notes.loadError")), "error");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [noteId, isNew, initialCourseId, toast, commitDraft, commitDirty]);

  useEffect(() => {
    const t = window.setTimeout(() => setPreviewBody(draft.body || ""), 180);
    return () => window.clearTimeout(t);
  }, [draft.body]);

  // Saves run one after another: a second save waits for the first, so a new
  // note is created once and later saves update it instead of duplicating it.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());

  const persistOnce = useCallback(async () => {
    const d = draftRef.current;
    if (!d.title) return d;
    const wasNew = d.id == null;
    const sent = { title: d.title, body: d.body || "", course_id: d.course_id ?? null };
    const saved = await api.saveNote({ id: d.id, ...sent });
    if (!saved?.id) {
      throw new Error("La note n'a pas été enregistrée.");
    }
    // Keep whatever was typed while the save was in flight: take back only the
    // fields the backend owns, and stay dirty if the draft moved on.
    const cur = draftRef.current;
    commitDraft({ ...cur, id: saved.id, updated_at: saved.updated_at });
    const unchanged =
      cur.title === sent.title &&
      (cur.body || "") === sent.body &&
      (cur.course_id ?? null) === sent.course_id;
    if (unchanged) commitDirty(false);
    // The tab shows the title being typed, not the one that was just saved.
    const tabTitle = cur.title || saved.title || "Note";
    if (wasNew && saved.id) {
      api.logEvent("note_write", saved.title || "Note", saved.course_id ?? null);
      loggedWrite.current = true;
      const nextId = `note:${saved.id}`;
      if (tabId !== nextId) {
        tabs.retarget(tabId, nextId, tabTitle, { noteId: saved.id, isNew: false });
      }
      tabs.rename(nextId, tabTitle, { noteId: saved.id, isNew: false });
    } else if (!loggedWrite.current) {
      api.logEvent("note_write", saved.title || "Note", saved.course_id ?? null);
      loggedWrite.current = true;
      tabs.rename(tabId, tabTitle);
    } else {
      tabs.rename(tabId, tabTitle);
    }
    changed("library");
    return saved;
  }, [tabId, commitDraft, commitDirty]);

  const persist = useCallback(() => {
    const run = saveChain.current.then(persistOnce, persistOnce);
    saveChain.current = run.catch(() => undefined);
    return run;
  }, [persistOnce]);

  useEffect(() => {
    editors.setDirty(tabId, dirty);
    return () => editors.setDirty(tabId, false);
  }, [tabId, dirty]);

  useEffect(() => {
    return editors.registerFlush(tabId, async () => {
      if (dirtyRef.current) await persist();
    });
  }, [tabId, persist]);

  // Auto save on changes (debounced)
  useEffect(() => {
    if (!isTauri()) return;
    if (!dirty || !draft.title) return;
    const t = setTimeout(() => {
      persist().catch((err) => {
        reportError("note.autosave", err);
        toast(errorMessage(err, tr("notes.saveError")), "error");
      });
    }, 800);
    return () => clearTimeout(t);
  }, [dirty, draft, persist, toast]);

  useEffect(() => {
    return () => {
      // Closing with « Ne pas enregistrer » (or deleting the note) must not
      // write the abandoned draft back.
      if (editors.takeDiscarded(tabId)) return;
      if (dirtyRef.current && draftRef.current.title) {
        persist().catch(logged("note.saveOnClose"));
      }
    };
  }, [persist, tabId]);

  const markDirty = (updates: Partial<Note>) => {
    commitDraft({ ...draftRef.current, ...updates });
    commitDirty(true);
  };

  // Markdown insert helpers (visible syntax in editor)
  const insertAround = (prefix: string, suffix: string) => {
    const ta = textareaRef.current;
    if (!ta || !draft) return;
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const selected = (draft.body || "").substring(start, end);
    const before = (draft.body || "").substring(0, start);
    const after = (draft.body || "").substring(end);
    const newBody = before + prefix + selected + suffix + after;
    markDirty({ body: newBody });
    setTimeout(() => {
      if (ta) {
        ta.focus();
        ta.selectionStart = start + prefix.length;
        ta.selectionEnd = start + prefix.length + selected.length;
      }
    }, 0);
  };

  const insertBold = () => insertAround("**", "**");
  const insertItalic = () => insertAround("*", "*");

  const insertCode = () => {
    const ta = textareaRef.current;
    if (!ta || !draft) return;
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const selected = (draft.body || "").substring(start, end);
    const before = (draft.body || "").substring(0, start);
    const after = (draft.body || "").substring(end);
    const isBlock = selected.includes("\n") || !selected;
    const pre = isBlock ? "```\n" : "`";
    const suf = isBlock ? "\n```" : "`";
    const newBody = before + pre + selected + suf + after;
    markDirty({ body: newBody });
    setTimeout(() => {
      if (ta) {
        ta.focus();
        const off = isBlock ? 4 : 1;
        ta.selectionStart = start + off;
        ta.selectionEnd = start + off + selected.length;
      }
    }, 0);
  };

  const insertAtLinePrefixes = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta || !draft) return;
    const body = draft.body || "";
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    let lineStart = start;
    while (lineStart > 0 && body[lineStart - 1] !== "\n") lineStart--;
    let lineEnd = end;
    while (lineEnd < body.length && body[lineEnd] !== "\n") lineEnd++;
    const before = body.substring(0, lineStart);
    const sel = body.substring(lineStart, lineEnd);
    const after = body.substring(lineEnd);
    const lines = sel.split("\n");
    const newLines = lines.map((l) => prefix + l.replace(/^(#{1,6}\s*|- \s*|\* \s*|\+ \s*|\d+\.\s*)/, ""));
    const newSel = newLines.join("\n");
    const newBody = before + newSel + after;
    markDirty({ body: newBody });
    setTimeout(() => {
      if (ta) {
        ta.focus();
        ta.selectionStart = lineStart + prefix.length;
        ta.selectionEnd =
          lineStart +
          prefix.length +
          (lines[0]?.replace(/^(#{1,6}\s*|- \s*|\* \s*|\+ \s*|\d+\.\s*)/, "").length || 0);
      }
    }, 0);
  };

  const insertTitle = () => insertAtLinePrefixes("# ");
  const insertList = () => insertAtLinePrefixes("- ");

  // Link popup
  const openLinkPopup = () => {
    const ta = textareaRef.current;
    if (!ta || !draft) return;
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const selected = (draft.body || "").substring(start, end);
    setLinkSelection({ start, end });
    setLinkTextInput(selected);
    setLinkUrlInput("https://");
    setLinkPopupOpen(true);
  };

  const insertLinkFromPopup = () => {
    if (!linkSelection || !draft) {
      closeLinkPopup();
      return;
    }
    const { start, end } = linkSelection;
    const before = (draft.body || "").substring(0, start);
    const after = (draft.body || "").substring(end);
    const text = linkTextInput.trim() || "lien";
    const url = linkUrlInput.trim() || "https://";
    const md = `[${text}](${url})`;
    const newBody = before + md + after;
    markDirty({ body: newBody });
    closeLinkPopup();
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.selectionStart = start + 1;
        ta.selectionEnd = start + 1 + text.length;
      }
    }, 0);
  };

  const closeLinkPopup = () => {
    setLinkPopupOpen(false);
    setLinkSelection(null);
    setLinkTextInput("");
    setLinkUrlInput("https://");
  };

  const onTitleChange = (title: string) => {
    markDirty({ title });
    tabs.rename(tabId, title || tr("notes.newTitle"));
  };
  const onCourseChange = (courseId: number | null) => markDirty({ course_id: courseId });

  const doDelete = async () => {
    if (!draft.id) return;
    const ok = await confirm.ask({
      title: tr("notes.deleteConfirm"),
      message: tr("notes.deleteConfirm"),
      confirmLabel: tr("common.delete"),
      danger: true,
    });
    if (!ok) return;
    await api.deleteNote(draft.id);
    toast(tr("notes.deleted"), "success");
    changed("library");
    tabs.close(tabId, { discard: true });
  };

  const doSave = async () => {
    if (!draft.title?.trim()) {
      toast(tr("notes.titleRequired"), "error");
      return;
    }
    try {
      await persist();
      toast(tr("notes.saved"), "success");
    } catch (err) {
      reportError("note.save", err);
      toast(errorMessage(err, tr("notes.saveError")), "error");
    }
  };

  const classes = useQuery({
    ...q.courseClasses(draft.course_id ?? 0),
    enabled: draft.course_id != null,
  }).data;

  /** The note's course, its classes and today: for templates and the printed header. */
  const context = () => ({
    cours: courses.find((c) => c.id === draft.course_id)?.name ?? "",
    classe: (classes ?? []).map((c) => c.class_name).join(", "),
    date: new Date().toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  });

  /**
   * Starts the note from a template (asking first if it has text). An
   * untitled note takes the template's title; the first « … » is selected,
   * ready to type over.
   */
  const applyTemplate = async (t: NoteTemplate) => {
    const current = draftRef.current;
    if ((current.body || "").trim()) {
      const ok = await confirm.ask({
        title: tr("templates.replaceTitle"),
        message: tr("templates.replaceMessage", { name: t.name }),
        confirmLabel: tr("templates.replace"),
        danger: true,
      });
      if (!ok) return;
    }
    const filled = fillTemplate(t, context());
    const untitled = !current.title?.trim() || current.title === tr("notes.newTitle");
    markDirty({ body: filled.body, ...(untitled ? { title: filled.title } : {}) });
    if (untitled) tabs.rename(tabId, filled.title);
    window.setTimeout(() => {
      const ta = textareaRef.current;
      const at = filled.body.indexOf("…");
      if (!ta) return;
      ta.focus();
      if (at >= 0) ta.setSelectionRange(at, at + 1);
    }, 0);
  };

  /**
   * « pdf » and « evaluation » write a PDF into the library (with the
   * note's course), « paper » opens the print dialog. Where the webview
   * cannot write the PDF itself, the dialog takes over.
   */
  const print = async (kind: "pdf" | "evaluation" | "paper") => {
    if (printJob) return;
    const title = draft.title?.trim() || tr("notes.newTitle");
    const { cours, classe, date } = context();
    const job: PrintJob = {
      title,
      body: draft.body || "",
      context: [cours, classe].filter(Boolean).join(" · "),
      date,
      nameBox: kind === "evaluation",
    };
    flushSync(() => setPrintJob(job));
    try {
      await sheetReady();
      if (kind === "paper" || !isTauri()) {
        await printDialog();
        return;
      }
      try {
        const file = await api.printToPdf(title, draft.course_id ?? null);
        api.logEvent("note_export", file.name, draft.course_id ?? null);
        changed("library");
        toast(tr("print.saved", { name: file.name }), "success", {
          action: { label: tr("print.open"), run: () => openFile(file) },
        });
      } catch (err) {
        reportError("note.printToPdf", err);
        toast(tr("print.fallback"), "info");
        await printDialog();
      }
    } finally {
      setPrintJob(null);
    }
  };
  useShortcut("print", () => void print("paper"), active);

  if (loading) {
    return <Loading label={tr("notes.loading")} />;
  }

  const selectedCourse = courses.find((c) => c.id === draft.course_id);

  return (
    <div className="h-full flex flex-col min-h-0 bg-canvas">
      {/* Title + destination + actions */}
      <Toolbar className="h-11 py-0 gap-2">
        <input
          className="flex-1 min-w-0 bg-transparent border-none eu-t-title text-ink px-1 -mx-1 py-1 rounded outline-hidden placeholder:text-ink-faint"
          value={draft.title || ""}
          placeholder={tr("notes.titlePlaceholder")}
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label={tr("notes.titlePlaceholder")}
        />
        {dirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-warn-solid shrink-0" data-tip={tr("app.unsaved")} />
        )}
        <ToolSep />
        <select
          className="eu-select eu-field-sm w-[140px]"
          value={draft.course_id ?? ""}
          onChange={(e) => onCourseChange(e.target.value ? Number(e.target.value) : null)}
          data-tip={tr("notes.courseTitle")}
          aria-label={tr("notes.courseTitle")}
        >
          <option value="">{tr("notes.general")}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <ToolGroup>
          <button
            onClick={() => setPresenting(true)}
            className="eu-btn-quiet eu-btn-sm"
            {...tip(tr("slides.presentTitle"), keysOf("present"))}
          >
            <Icon icon={Presentation} size={14} />
            <span className="hidden @3xl:inline">{tr("slides.present")}</span>
          </button>
          <MenuButton
            label={tr("print.menu")}
            className="eu-btn-quiet eu-btn-sm"
            items={[
              { label: tr("print.pdf"), icon: FileDown, onSelect: () => void print("pdf") },
              {
                label: tr("print.evaluation"),
                icon: ClipboardCheck,
                onSelect: () => void print("evaluation"),
              },
              "separator",
              {
                label: tr("print.paper"),
                icon: Printer,
                keys: keysOf("print"),
                onSelect: () => void print("paper"),
              },
            ]}
          >
            <Icon icon={FileDown} size={14} />
            <span className="hidden @3xl:inline">PDF</span>
            <Icon icon={ChevronDown} size={14} />
          </MenuButton>
          {draft.id && (
            <button
              onClick={doDelete}
              className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
              aria-label={tr("common.delete")}
              data-tip={tr("common.delete")}
            >
              <Icon icon={Trash2} size={14} />
            </button>
          )}
          <button
            onClick={doSave}
            disabled={!dirty}
            className="eu-btn-primary eu-btn-sm"
            {...tip(tr("common.save"), keysOf("save"))}
          >
            {tr("common.save")}
          </button>
        </ToolGroup>
      </Toolbar>

      {/* Markdown toolbar */}
      <div className="relative shrink-0">
        <Toolbar className="h-8 py-0 gap-0.5">
          {view !== "preview" && (
            <ToolGroup className="gap-0" label={tr("notes.format")}>
              <button
                onClick={insertBold}
                className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                data-tip={tr("notes.bold")}
                aria-label={tr("notes.bold")}
              >
                <span className="font-bold text-body">B</span>
              </button>
              <button
                onClick={insertItalic}
                className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                data-tip={tr("notes.italic")}
                aria-label={tr("notes.italic")}
              >
                <span className="italic text-body">I</span>
              </button>
              <button
                onClick={insertTitle}
                className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                data-tip={tr("notes.heading")}
                aria-label={tr("notes.heading")}
              >
                <span className="font-semibold text-body">H</span>
              </button>
              <button
                onClick={insertList}
                className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                data-tip={tr("notes.list")}
                aria-label={tr("notes.list")}
              >
                <span className="text-body">•</span>
              </button>
              <button
                onClick={insertCode}
                className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                data-tip={tr("notes.code")}
                aria-label={tr("notes.code")}
              >
                <Icon icon={CodeXml} size={16} />
              </button>
              <button
                onClick={openLinkPopup}
                className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                data-tip={tr("notes.link")}
                aria-label={tr("notes.link")}
              >
                <Icon icon={LinkGlyph} size={16} />
              </button>
            </ToolGroup>
          )}
          <TemplateMenu
            note={{ title: draft.title || "", body: draft.body || "" }}
            onPick={(t) => void applyTemplate(t)}
          />
          <ToolSpacer />
          <span className="eu-t-caption truncate @max-4xl:hidden">{tr("notes.markdownHint")}</span>
          <Segmented
            value={view}
            onChange={setView}
            label={tr("notes.viewMode")}
            className="h-(--eu-control-sm) shrink-0 ml-2"
            options={[
              { value: "edit", label: tr("notes.viewEdit") },
              { value: "split", label: tr("notes.viewSplit") },
              { value: "preview", label: tr("notes.viewPreview") },
            ]}
          />
        </Toolbar>

        {linkPopupOpen && (
          <div className="absolute top-full left-2 mt-1 z-30 w-[300px] eu-panel shadow-pop p-3">
            <p className="eu-t-label mb-2">{tr("notes.addLink")}</p>
            <div className="flex flex-col gap-2">
              <input
                className="eu-input"
                placeholder={tr("notes.linkText")}
                value={linkTextInput}
                onChange={(e) => setLinkTextInput(e.target.value)}
                autoFocus
                aria-label={tr("notes.linkText")}
              />
              <input
                className="eu-input"
                placeholder={tr("notes.linkUrl")}
                value={linkUrlInput}
                onChange={(e) => setLinkUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") insertLinkFromPopup();
                  if (e.key === "Escape") closeLinkPopup();
                }}
                aria-label={tr("notes.linkUrl")}
              />
            </div>
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={closeLinkPopup} className="eu-btn-quiet eu-btn-sm">
                {tr("common.cancel")}
              </button>
              <button onClick={insertLinkFromPopup} className="eu-btn-primary eu-btn-sm">
                {tr("notes.insert")}
              </button>
            </div>
          </div>
        )}
      </div>

      {!(draft.body || "").trim() && <TemplateStrip onPick={(t) => void applyTemplate(t)} />}

      {/* Source | preview */}
      <div className="flex-1 min-h-0 flex flex-col @3xl:flex-row overflow-hidden">
        {view !== "preview" && (
          <div
            className={`flex-1 flex flex-col min-w-0 min-h-0 ${
              view === "split" ? "border-b border-line @3xl:border-b-0 @3xl:border-r" : ""
            }`}
          >
            {view === "split" && (
              <p className="eu-t-label px-3 py-1.5 border-b border-line">{tr("notes.source")}</p>
            )}
            <textarea
              ref={textareaRef}
              value={draft.body || ""}
              onChange={(e) => markDirty({ body: e.target.value })}
              onKeyDown={(e) => {
                const mod = isMac ? e.metaKey : e.ctrlKey;
                if (!mod || e.shiftKey || e.altKey) return;
                const k = e.key.toLowerCase();
                if (k === "b") {
                  e.preventDefault();
                  insertBold();
                } else if (k === "i") {
                  e.preventDefault();
                  insertItalic();
                }
              }}
              placeholder={tr("notes.bodyPlaceholder")}
              className="flex-1 min-h-0 bg-canvas text-ink p-3 font-mono text-code resize-none outline-hidden selectable"
              style={{ whiteSpace: "pre-wrap" }}
              aria-label={tr("notes.source")}
            />
          </div>
        )}

        {view !== "edit" && (
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {view === "split" && (
              <p className="eu-t-label px-3 py-1.5 border-b border-line">{tr("notes.preview")}</p>
            )}
            <div className="flex-1 min-h-0 overflow-auto p-4 bg-panel selectable">
              {previewBody ? (
                <Markdown
                  body={previewBody}
                  className={`max-w-[68ch] ${view === "preview" ? "mx-auto" : ""}`}
                />
              ) : (
                <p className="eu-t-body text-ink-faint italic">{tr("notes.previewEmpty")}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {printJob && <PrintSheet job={printJob} />}

      {presenting && (
        <Suspense fallback={null}>
          <Slides
            markdown={draft.body || ""}
            title={draft.title || tr("notes.newTitle")}
            onClose={() => setPresenting(false)}
          />
        </Suspense>
      )}

      {/* Status */}
      <div className="shrink-0 flex items-center gap-2 px-3 h-6 border-t border-line bg-panel-alt">
        <span className="eu-t-caption">
          {draft.updated_at
            ? tr("notes.savedAt", { when: relativeTime(draft.updated_at) })
            : tr("notes.neverSaved")}
        </span>
        {selectedCourse ? (
          <span className="eu-chip">{selectedCourse.name}</span>
        ) : (
          <span className="eu-chip">{tr("notes.general")}</span>
        )}
      </div>
    </div>
  );
}
