import { useEffect, useRef, useState } from "react";
import { useTabs } from "../lib/tabs";
import { api, type Course, type Note } from "../lib/api";
import { useToast } from "./ui";
import { TrashIcon, CodeIcon, LinkIcon } from "./icons";
import { get } from "../lib/i18n";
import ReactMarkdown from 'react-markdown';

interface NoteEditorProps {
  noteId?: number;
  isNew?: boolean;
  initialCourseId?: number;
}

export default function NoteEditor({ noteId, isNew, initialCourseId }: NoteEditorProps) {
  const tabs = useTabs();
  const toast = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [draft, setDraft] = useState<Partial<Note> & { id?: number }>({
    title: "Nouvelle note",
    body: "",
    course_id: initialCourseId ?? null,
  });
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);

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
        setCourses(cs);

        if (noteId) {
          const all = await api.allNotes();
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

  // Auto save on changes (debounced)
  useEffect(() => {
    if (!dirty || !draft.title) return;
    const t = setTimeout(async () => {
      try {
        const wasNew = draft.id == null;
        const saved = await api.saveNote({
          id: draft.id,
          title: draft.title,
          body: draft.body || "",
          course_id: draft.course_id ?? null,
        });
        setDraft(saved);
        setDirty(false);
        // If this was a fresh "new" tab, migrate it to the stable note:<id> key so lists can target it without dup tabs
        if (wasNew && saved.id) {
          const cur = tabs.activeId;
          if (cur && cur.startsWith("note:new:")) {
            setTimeout(() => {
              tabs.close(cur);
              tabs.open({ kind: "note", title: saved.title || "Note", params: { noteId: saved.id } });
            }, 0);
          }
        }
        // refresh documents etc
        window.dispatchEvent(new CustomEvent("eu:library-changed"));
      } catch (e) {
        toast(get("notes.saveError", "Erreur lors de l'enregistrement"), "error");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [dirty, draft, toast]);

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
    // keep the tab title in sync live (even for unsaved new notes)
    if (tabs.activeId) tabs.rename(tabs.activeId, title || "Nouvelle note");
  };
  const onCourseChange = (courseId: number | null) => markDirty({ course_id: courseId });

  const doDelete = async () => {
    if (!draft.id) return;
    if (!confirm("Supprimer cette note ?")) return;
    await api.deleteNote(draft.id);
    toast(get("notes.deleted", "Note supprimée"), "success");
    window.dispatchEvent(new CustomEvent("eu:library-changed"));
    // close tab? for simplicity, user can close, or navigate away
    tabs.close(tabs.activeId!); // rough, may go to previous
  };

  const doSave = async () => {
    if (!draft.title?.trim()) {
      toast(get("notes.titleRequired", "Le titre est requis"), "error");
      return;
    }
    const wasNew = draft.id == null;
    const saved = await api.saveNote({
      id: draft.id,
      title: draft.title,
      body: draft.body || "",
      course_id: draft.course_id ?? null,
    });
    setDraft(saved);
    setDirty(false);
    toast(get("notes.saved", "Note enregistrée"), "success");
    // migrate new tab -> stable id tab (prevents duplicate tabs when later opening from Documents/Course list)
    if (wasNew && saved.id) {
      const cur = tabs.activeId;
      if (cur && cur.startsWith("note:new:")) {
        setTimeout(() => {
          tabs.close(cur);
          tabs.open({ kind: "note", title: saved.title || "Note", params: { noteId: saved.id } });
        }, 0);
      }
    }
    window.dispatchEvent(new CustomEvent("eu:library-changed"));
  };

  if (loading) {
    return <div className="p-6 text-mute">Chargement…</div>;
  }

  const selectedCourse = courses.find((c) => c.id === draft.course_id);

  return (
    <div className="h-full flex flex-col bg-surface p-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <input
          className="bg-transparent border-none text-xl font-semibold flex-1 min-w-0 px-1 -mx-1 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-tui-accent rounded"
          value={draft.title || ""}
          placeholder="Titre de la note"
          onChange={(e) => onTitleChange(e.target.value)}
        />

        <div className="flex items-center gap-1.5 shrink-0">
          <select
            className="new-input text-xs py-1 pr-5"
            value={draft.course_id ?? ""}
            onChange={(e) => onCourseChange(e.target.value ? Number(e.target.value) : null)}
            title="Affecter à un cours (ou Général)"
          >
            <option value="">Général</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {dirty && (
            <button onClick={doSave} className="new-btn-primary text-sm flex items-center gap-1">
              <span>Enregistrer</span>
            </button>
          )}
          {draft.id && (
            <button onClick={doDelete} className="new-btn-ghost text-sm flex items-center gap-1 text-red-400 hover:text-red-500">
              <TrashIcon className="w-4 h-4" /> Supprimer
            </button>
          )}
        </div>
      </div>

      {/* Toolbar + link popup container */}
      <div className="relative mb-2">
        <div className="flex items-center gap-1 px-2 py-1 bg-surface-soft border border-hairline rounded">
          <button onClick={insertBold} className="p-1.5 hover:bg-surface rounded" title="Gras">
            <span className="font-bold text-sm">B</span>
          </button>
          <button onClick={insertItalic} className="p-1.5 hover:bg-surface rounded" title="Italique">
            <span className="italic text-sm">I</span>
          </button>
          <button onClick={insertCode} className="p-1.5 hover:bg-surface rounded" title="Code">
            <CodeIcon className="w-4 h-4" />
          </button>
          <button onClick={insertTitle} className="p-1.5 hover:bg-surface rounded" title="Titre">
            <span className="font-semibold text-sm">H</span>
          </button>
          <button onClick={insertList} className="p-1.5 hover:bg-surface rounded" title="Liste">
            <span className="text-sm">•</span>
          </button>
          <button onClick={openLinkPopup} className="p-1.5 hover:bg-surface rounded" title="Lien">
            <LinkIcon className="w-4 h-4" />
          </button>
          <div className="ml-auto text-[10px] text-mute px-2">Markdown • les boutons insèrent la syntaxe</div>
        </div>

        {/* Little popup for link */}
        {linkPopupOpen && (
          <div className="absolute top-full left-0 mt-1 z-30 w-[300px] bg-surface border border-hairline rounded p-3 shadow-card text-sm">
            <div className="text-xs font-medium mb-2 text-mute">Ajouter un lien</div>
            <div className="space-y-2">
              <input
                className="new-input text-sm w-full"
                placeholder="Texte du lien"
                value={linkTextInput}
                onChange={(e) => setLinkTextInput(e.target.value)}
              />
              <input
                className="new-input text-sm w-full"
                placeholder="URL https://..."
                value={linkUrlInput}
                onChange={(e) => setLinkUrlInput(e.target.value)}
              />
            </div>
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={closeLinkPopup} className="new-btn-ghost text-xs">Annuler</button>
              <button onClick={insertLinkFromPopup} className="new-btn-primary text-xs">Insérer</button>
            </div>
          </div>
        )}
      </div>

      {/* Main editor area: split source + preview */}
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
        {/* Source (markdown visible) */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="text-xs text-mute mb-1 px-1">Source Markdown</div>
          <textarea
            ref={textareaRef}
            value={draft.body || ""}
            onChange={(e) => markDirty({ body: e.target.value })}
            className="flex-1 new-input p-3 text-sm leading-relaxed font-mono overflow-auto focus:outline-none focus-visible:ring-1 focus-visible:ring-tui-accent"
            style={{ whiteSpace: "pre-wrap", resize: "none" }}
            placeholder="Écrivez votre note en Markdown ici..."
          />
        </div>

        {/* Preview */}
        <div className="flex-1 flex flex-col min-w-0 border-l border-hairline pl-3">
          <div className="text-xs text-mute mb-1 px-1">Aperçu</div>
          <div className="flex-1 overflow-auto p-3 bg-surface-soft rounded text-sm leading-relaxed">
            {draft.body?.trim() ? (
              <ReactMarkdown
                components={{
                  a: ({ ...props }) => (
                    <a {...props} className="text-tui-accent underline hover:opacity-80" target="_blank" rel="noopener noreferrer" />
                  ),
                  h1: ({ children }) => <h1 className="text-xl font-bold mt-2 mb-1">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-semibold mt-2 mb-1">{children}</h2>,
                  code: ({ children, className }) => (
                    <code className={`bg-surface-soft px-1 py-0.5 rounded text-xs ${className || ""}`}>{children}</code>
                  ),
                  pre: ({ children }) => <pre className="bg-surface-soft p-2 rounded overflow-auto text-xs my-2">{children}</pre>,
                }}
              >
                {draft.body}
              </ReactMarkdown>
            ) : (
              <span className="text-mute italic">L'aperçu apparaîtra ici quand vous écrirez...</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-mute flex items-center gap-2">
        <span>Enregistrement automatique • Apparaît dans Documents</span>
        {selectedCourse && <span className="new-chip text-[9px]">{selectedCourse.name}</span>}
        {!draft.course_id && <span className="new-chip text-[9px]">Général</span>}
      </div>
    </div>
  );
}
