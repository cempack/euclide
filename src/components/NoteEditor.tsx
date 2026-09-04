import { useEffect, useRef, useState, useCallback } from "react";
import { useTabs } from "../lib/tabs";
import { api, isTauri, type Course, type Note } from "../lib/api";
import { useToast, useConfirm, Loading } from "./ui";
import { TrashIcon, CodeIcon, LinkIcon, DownloadIcon } from "./icons";
import { get, fmt } from "../lib/i18n";
import { Toolbar, ToolGroup, ToolSep, ToolSpacer } from "./layout";
import { MOD } from "../lib/shortcuts";
import { relativeTime } from "../lib/format";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { jsPDF } from "jspdf";
import "katex/dist/katex.min.css";

interface NoteEditorProps {
  tabId: string;
  noteId?: number;
  isNew?: boolean;
  initialCourseId?: number;
}

export default function NoteEditor({ tabId, noteId, isNew, initialCourseId }: NoteEditorProps) {
  const tabs = useTabs();
  const toast = useToast();
  const confirm = useConfirm();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [draft, setDraft] = useState<Partial<Note> & { id?: number }>({
    title: "Nouvelle note",
    body: "",
    course_id: initialCourseId ?? null,
  });
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const loggedWrite = useRef(false);

  const draftRef = useRef(draft);
  const dirtyRef = useRef(dirty);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  // Link popup state
  const [linkPopupOpen, setLinkPopupOpen] = useState(false);
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
          const all = (await api.allNotes()) ?? [];
          const found = all.find((n) => n.id === noteId);
          if (found && mounted) {
            setDraft(found);
            setDirty(false);
          }
        } else if (isNew) {
          // new note, preselect if initial
          setDraft({
            title: "Nouvelle note",
            body: "",
            course_id: initialCourseId ?? null,
          });
          setDirty(false);
        }
      } catch (e) {
        toast(get("notes.loadError", "Erreur de chargement des notes/cours"), "error");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [noteId, isNew, initialCourseId, toast]);

  const persist = useCallback(async () => {
    const d = draftRef.current;
    if (!d.title) return d;
    const wasNew = d.id == null;
    const saved = await api.saveNote({
      id: d.id,
      title: d.title,
      body: d.body || "",
      course_id: d.course_id ?? null,
    });
    if (!saved?.id) {
      throw new Error("save failed");
    }
    setDraft(saved);
    setDirty(false);
    if (wasNew && saved.id) {
      api.logEvent("note_write", saved.title || "Note", saved.course_id ?? null);
      loggedWrite.current = true;
      const nextId = `note:${saved.id}`;
      if (tabId !== nextId) {
        tabs.retarget(tabId, nextId, saved.title || "Note", { noteId: saved.id, isNew: false });
      }
      tabs.rename(nextId, saved.title || "Note", { noteId: saved.id, isNew: false });
    } else if (!loggedWrite.current) {
      api.logEvent("note_write", saved.title || "Note", saved.course_id ?? null);
      loggedWrite.current = true;
      tabs.rename(tabId, saved.title || "Note");
    } else {
      tabs.rename(tabId, saved.title || "Note");
    }
    window.dispatchEvent(new CustomEvent("eu:library-changed"));
    return saved;
  }, [tabId, tabs]);

  useEffect(() => {
    tabs.setTabDirty(tabId, dirty);
    return () => tabs.setTabDirty(tabId, false);
  }, [tabId, dirty, tabs]);

  useEffect(() => {
    return tabs.registerFlush(tabId, async () => {
      if (dirtyRef.current) await persist();
    });
  }, [tabId, tabs, persist]);

  // Auto save on changes (debounced)
  useEffect(() => {
    if (!isTauri()) return;
    if (!dirty || !draft.title) return;
    const t = setTimeout(() => {
      persist().catch(() => {
        toast(get("notes.saveError", "Erreur lors de l'enregistrement"), "error");
      });
    }, 800);
    return () => clearTimeout(t);
  }, [dirty, draft, persist, toast]);

  useEffect(() => {
    return () => {
      if (dirtyRef.current && draftRef.current.title) {
        persist().catch(() => {});
      }
    };
  }, [persist]);

  const markDirty = (updates: Partial<Note>) => {
    setDraft((d) => ({ ...d, ...updates }));
    setDirty(true);
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
    const newLines = lines.map((l) =>
      prefix + l.replace(/^(#{1,6}\s*|- \s*|\* \s*|\+ \s*|\d+\.\s*)/, "")
    );
    const newSel = newLines.join("\n");
    const newBody = before + newSel + after;
    markDirty({ body: newBody });
    setTimeout(() => {
      if (ta) {
        ta.focus();
        ta.selectionStart = lineStart + prefix.length;
        ta.selectionEnd = lineStart + prefix.length + (lines[0]?.replace(/^(#{1,6}\s*|- \s*|\* \s*|\+ \s*|\d+\.\s*)/, "").length || 0);
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
    tabs.rename(tabId, title || "Nouvelle note");
  };
  const onCourseChange = (courseId: number | null) => markDirty({ course_id: courseId });

  const doDelete = async () => {
    if (!draft.id) return;
    const ok = await confirm.ask({
      title: get("notes.deleteConfirm", "Supprimer cette note ?"),
      message: get("notes.deleteConfirm", "Supprimer cette note ?"),
      confirmLabel: get("common.delete", "Supprimer"),
      danger: true,
    });
    if (!ok) return;
    await api.deleteNote(draft.id);
    toast(get("notes.deleted", "Note supprimée"), "success");
    window.dispatchEvent(new CustomEvent("eu:library-changed"));
    tabs.close(tabId);
  };

  const doSave = async () => {
    if (!draft.title?.trim()) {
      toast(get("notes.titleRequired", "Le titre est requis"), "error");
      return;
    }
    try {
      await persist();
      toast(get("notes.saved", "Note enregistrée"), "success");
    } catch {
      toast(get("notes.saveError", "Erreur lors de l'enregistrement"), "error");
    }
  };

  const exportPdf = async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const title = draft.title || "Note";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, 48, 56);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const body = (draft.body || "").replace(/\$\$[\s\S]*?\$\$/g, "[formule]").replace(/\$[^$]+\$/g, "[formule]");
    const lines = doc.splitTextToSize(body || " ", 500);
    doc.text(lines, 48, 84);
    const dataUrl = doc.output("dataurlstring");
    try {
      const f = await api.saveExport(`${title}.pdf`, dataUrl);
      if (!f?.id) {
        doc.save(`${title}.pdf`);
        toast(get("notes.exported", "Exporté : {name}").replace("{name}", `${title}.pdf`), "success");
        return;
      }
      toast(get("notes.exported", "Exporté : {name}").replace("{name}", f.name), "success");
      window.dispatchEvent(new CustomEvent("eu:library-changed"));
    } catch {
      doc.save(`${title}.pdf`);
      toast(get("notes.exported", "Exporté : {name}").replace("{name}", `${title}.pdf`), "success");
    }
  };

  if (loading) {
    return <Loading label={get("notes.loading", "Chargement…")} />;
  }

  const selectedCourse = courses.find((c) => c.id === draft.course_id);

  return (
    <div className="h-full flex flex-col min-h-0 bg-canvas">
      {/* Title + destination + actions */}
      <Toolbar className="h-11 py-0 gap-2">
        <input
          className="flex-1 min-w-0 bg-transparent border-none eu-t-section text-[17px] text-ink px-1 -mx-1 py-1 rounded outline-none placeholder:text-ink-faint"
          value={draft.title || ""}
          placeholder={get("notes.titlePlaceholder", "Titre de la note")}
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label={get("notes.titlePlaceholder", "Titre de la note")}
        />
        {dirty && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-warn-solid shrink-0"
            title={get("app.unsaved", "Non enregistré")}
          />
        )}
        <ToolSep />
        <select
          className="eu-select h-7 w-[140px] text-[11.5px]"
          value={draft.course_id ?? ""}
          onChange={(e) => onCourseChange(e.target.value ? Number(e.target.value) : null)}
          title={get("notes.courseTitle", "Affecter à un cours")}
          aria-label={get("notes.courseTitle", "Affecter à un cours")}
        >
          <option value="">{get("notes.general", "Général")}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <ToolGroup>
          <button
            onClick={exportPdf}
            className="eu-btn-quiet eu-btn-sm"
            title={get("notes.exportPdf", "Exporter en PDF")}
          >
            <DownloadIcon className="w-3.5 h-3.5" /> PDF
          </button>
          {draft.id && (
            <button
              onClick={doDelete}
              className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
              aria-label={get("common.delete", "Supprimer")}
              title={get("common.delete", "Supprimer")}
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={doSave}
            disabled={!dirty}
            className="eu-btn-primary eu-btn-sm"
            title={`${get("common.save", "Enregistrer")} (${MOD}S)`}
          >
            {get("common.save", "Enregistrer")}
          </button>
        </ToolGroup>
      </Toolbar>

      {/* Markdown toolbar */}
      <div className="relative shrink-0">
        <Toolbar className="h-8 py-0 gap-0.5">
          <ToolGroup className="gap-0" label={get("notes.format", "Mise en forme")}>
            <button onClick={insertBold} className="eu-btn-quiet eu-btn-icon eu-btn-sm" title={get("notes.bold", "Gras")} aria-label={get("notes.bold", "Gras")}>
              <span className="font-bold text-[13px]">B</span>
            </button>
            <button onClick={insertItalic} className="eu-btn-quiet eu-btn-icon eu-btn-sm" title={get("notes.italic", "Italique")} aria-label={get("notes.italic", "Italique")}>
              <span className="italic text-[13px]">I</span>
            </button>
            <button onClick={insertTitle} className="eu-btn-quiet eu-btn-icon eu-btn-sm" title={get("notes.heading", "Titre")} aria-label={get("notes.heading", "Titre")}>
              <span className="font-semibold text-[13px]">H</span>
            </button>
            <button onClick={insertList} className="eu-btn-quiet eu-btn-icon eu-btn-sm" title={get("notes.list", "Liste")} aria-label={get("notes.list", "Liste")}>
              <span className="text-[13px]">•</span>
            </button>
            <button onClick={insertCode} className="eu-btn-quiet eu-btn-icon eu-btn-sm" title={get("notes.code", "Code")} aria-label={get("notes.code", "Code")}>
              <CodeIcon className="w-4 h-4" />
            </button>
            <button onClick={openLinkPopup} className="eu-btn-quiet eu-btn-icon eu-btn-sm" title={get("notes.link", "Lien")} aria-label={get("notes.link", "Lien")}>
              <LinkIcon className="w-4 h-4" />
            </button>
          </ToolGroup>
          <ToolSpacer />
          <span className="eu-t-label normal-case tracking-normal">
            {get("notes.markdownHint", "Markdown · formules LaTeX entre $…$")}
          </span>
        </Toolbar>

        {linkPopupOpen && (
          <div className="absolute top-full left-2 mt-1 z-30 w-[300px] eu-panel shadow-pop p-3">
            <p className="eu-t-label mb-2">{get("notes.addLink", "Ajouter un lien")}</p>
            <div className="flex flex-col gap-2">
              <input
                className="eu-input"
                placeholder={get("notes.linkText", "Texte affiché")}
                value={linkTextInput}
                onChange={(e) => setLinkTextInput(e.target.value)}
                autoFocus
                aria-label={get("notes.linkText", "Texte affiché")}
              />
              <input
                className="eu-input"
                placeholder={get("notes.linkUrl", "https://…")}
                value={linkUrlInput}
                onChange={(e) => setLinkUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") insertLinkFromPopup();
                  if (e.key === "Escape") closeLinkPopup();
                }}
                aria-label={get("notes.linkUrl", "Adresse")}
              />
            </div>
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={closeLinkPopup} className="eu-btn-quiet eu-btn-sm">
                {get("common.cancel", "Annuler")}
              </button>
              <button onClick={insertLinkFromPopup} className="eu-btn-primary eu-btn-sm">
                {get("notes.insert", "Insérer")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Source | preview */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 border-r border-line">
          <p className="eu-t-label px-3 py-1.5 border-b border-line">
            {get("notes.source", "Source Markdown")}
          </p>
          <textarea
            ref={textareaRef}
            value={draft.body || ""}
            onChange={(e) => markDirty({ body: e.target.value })}
            placeholder={get("notes.bodyPlaceholder", "Écrivez ici…")}
            className="flex-1 min-h-0 bg-canvas text-ink p-3 font-mono text-[13px] leading-[1.6] resize-none outline-none selectable"
            style={{ whiteSpace: "pre-wrap" }}
            aria-label={get("notes.source", "Source Markdown")}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <p className="eu-t-label px-3 py-1.5 border-b border-line">
            {get("notes.preview", "Aperçu")}
          </p>
          <div className="flex-1 min-h-0 overflow-auto p-4 bg-panel selectable">
            {draft.body ? (
              <div className="eu-prose max-w-[68ch]">
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    a: (props) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" />
                    ),
                  }}
                >
                  {draft.body}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="eu-t-body text-ink-faint italic">
                {get("notes.previewEmpty", "L'aperçu apparaîtra ici pendant que vous écrivez.")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="shrink-0 flex items-center gap-2 px-3 h-6 border-t border-line bg-panel-alt">
        <span className="eu-t-label normal-case tracking-normal">
          {draft.updated_at
            ? fmt(get("notes.savedAt", "enregistré {when}"), { when: relativeTime(draft.updated_at) })
            : get("notes.neverSaved", "jamais enregistré")}
        </span>
        {selectedCourse ? (
          <span className="eu-chip">{selectedCourse.name}</span>
        ) : (
          <span className="eu-chip">{get("notes.general", "Général")}</span>
        )}
      </div>
    </div>
  );
}
