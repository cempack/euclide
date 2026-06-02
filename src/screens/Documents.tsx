import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Course, type FileItem, type Note, type SearchHit } from "../lib/api";
import { useTabs } from "../lib/tabs";
import { t } from "../lib/i18n";
import { fileKindEmoji, humanSize, relativeTime } from "../lib/format";
import { EmptyState, useToast } from "../components/ui";
import { DocIcon, NoteIcon, PlusIcon, SearchIcon } from "../components/icons";

type Filter = { kind: "all" } | { kind: "type"; value: string } | { kind: "class"; courseId: number };

const TYPE_CHIPS = [
  { value: "pdf", label: "PDF", emoji: "📄" },
  { value: "image", label: "Images", emoji: "🖼️" },
  { value: "board", label: "Tableaux", emoji: "🖊️" },
  { value: "note", label: "Notes", emoji: "📝" },
];

export default function Documents() {
  const toast = useToast();
  const tabs = useTabs();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [docs, setDocs] = useState<FileItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    api.listFiles(null).then(setDocs).catch(() => {});
    api.allNotes().then(setNotes).catch(() => {});
    api.listCourses().then(setCourses).catch(() => {});
  };
  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("eu:library-changed", onChange);
    const focus = () => searchRef.current?.focus();
    window.addEventListener("eu:focus-search", focus);
    return () => {
      window.removeEventListener("eu:library-changed", onChange);
      window.removeEventListener("eu:focus-search", focus);
    };
  }, []);

  useEffect(() => {
    const h = setTimeout(() => {
      if (query.trim().length < 2) return setHits([]);
      api.searchDocuments(query.trim()).then(setHits).catch(() => {});
    }, 160);
    return () => clearTimeout(h);
  }, [query]);

  const courseName = (id: number | null) => courses.find((c) => c.id === id)?.name;
  const courseEmoji = (id: number | null) => courses.find((c) => c.id === id)?.emoji ?? "📁";

  const importDocs = async () => {
    const added = await api.importFiles(null);
    if (added.length) {
      added.forEach((f) => api.logEvent("file_import", f.name, null));
      toast(`${added.length} document(s) importe(s)`, "success");
      await api.reindexDocuments();
    }
    refresh();
  };

  const openFile = (f: FileItem) => {
    api.logEvent("file_open", f.name, f.course_id);
    if (f.kind === "board") tabs.open({ kind: "whiteboard", title: f.name, params: { fileId: f.id } });
    else if (f.kind === "pdf" || f.kind === "image")
      tabs.open({ kind: "pdf", title: f.name, params: { fileId: f.id, fileName: f.name } });
    else api.openFile(f.id);
  };

  const openNote = (n: Note) => {
    if (n.course_id) tabs.open({ kind: "course", title: courseName(n.course_id) ?? "Cours", params: { courseId: n.course_id } });
    else tabs.open({ kind: "courses" });
  };

  // unified, filtered library
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fileItems = docs
      .filter((f) => {
        if (filter.kind === "type" && filter.value !== "note") return f.kind === filter.value;
        if (filter.kind === "type" && filter.value === "note") return false;
        if (filter.kind === "class") return f.course_id === filter.courseId;
        return true;
      })
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .map((f) => ({ t: "file" as const, f }));
    const noteItems = notes
      .filter(() => {
        if (filter.kind === "type") return filter.value === "note";
        if (filter.kind === "class") return false;
        return true;
      })
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      .map((n) => ({ t: "note" as const, n }));
    // notes that belong to a selected class
    const noteForClass =
      filter.kind === "class"
        ? notes
            .filter((n) => n.course_id === filter.courseId)
            .filter((n) => !q || n.title.toLowerCase().includes(q))
            .map((n) => ({ t: "note" as const, n }))
        : [];
    return [...noteItems, ...noteForClass, ...fileItems];
  }, [docs, notes, filter, query]);

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors whitespace-nowrap ${
      active
        ? "bg-[#1f1f1f] text-white border-[#1f1f1f]"
        : "bg-white text-[#6a6a6a] border-[#e5e5e5] hover:text-[#1f1f1f]"
    }`;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display tracking-tight text-eu-text">{t.nav.documents}</h1>
          <p className="eu-sub mt-1">Tous vos supports et notes, au meme endroit.</p>
        </div>
        <button onClick={importDocs} className="eu-btn-primary">
          <PlusIcon className="w-4 h-4" /> {t.importFiles}
        </button>
      </header>

      <div className="relative">
        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6a6a6a]" />
        <input
          ref={searchRef}
          className="eu-input pl-11 py-3 text-base"
          placeholder={t.searchDocs}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* filter tags */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setFilter({ kind: "all" })} className={chip(filter.kind === "all")}>
          Tout
        </button>
        {TYPE_CHIPS.map((c) => (
          <button
            key={c.value}
            onClick={() => setFilter({ kind: "type", value: c.value })}
            className={chip(filter.kind === "type" && filter.value === c.value)}
          >
            {c.emoji} {c.label}
          </button>
        ))}
        {courses.length > 0 && <span className="w-px h-5 bg-[#ededed] shrink-0" />}
        {courses.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter({ kind: "class", courseId: c.id })}
            className={chip(filter.kind === "class" && filter.courseId === c.id)}
          >
            {c.emoji} {c.name}
          </button>
        ))}
      </div>

      {/* content search results */}
      {query.trim().length >= 2 && hits.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="eu-sub">Dans le contenu des PDF</p>
          {hits.map((h) => (
            <button
              key={`hit${h.doc_id}`}
              onClick={() => openFile({ id: h.doc_id, name: h.name, kind: "pdf", course_id: h.course_id } as FileItem)}
              className="eu-card p-4 text-left hover:shadow-glow transition-all"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">📄</span>
                <p className="font-medium text-eu-text">{h.name}</p>
              </div>
              {h.snippet && (
                <p
                  className="eu-sub mt-1.5 line-clamp-2 [&_mark]:bg-[#fff8e0] [&_mark]:text-[#fa520f] [&_mark]:rounded [&_mark]:px-0.5"
                  dangerouslySetInnerHTML={{ __html: h.snippet }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="eu-card p-6">
          <EmptyState
            icon={<DocIcon className="w-9 h-9" />}
            title="Rien ici pour l'instant"
            hint="Importez des fichiers (ou glissez-les dans la fenetre), ou ecrivez des notes dans vos cours."
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((it) =>
            it.t === "file" ? (
              <button
                key={`f${it.f.id}`}
                onClick={() => openFile(it.f)}
                className="eu-card p-4 text-left hover:shadow-glow hover:-translate-y-0.5 transition-all"
              >
                <div className="text-3xl mb-2">{fileKindEmoji(it.f.kind)}</div>
                <p className="text-sm font-medium text-eu-text truncate">{it.f.name}</p>
                <p className="text-[11px] text-eu-muted mt-0.5 truncate">
                  {it.f.course_id ? `${courseEmoji(it.f.course_id)} ${courseName(it.f.course_id)}` : humanSize(it.f.size)}
                  {" · "}
                  {relativeTime(it.f.added_at)}
                </p>
              </button>
            ) : (
              <button
                key={`n${it.n.id}`}
                onClick={() => openNote(it.n)}
                className="eu-card p-4 text-left hover:shadow-glow hover:-translate-y-0.5 transition-all"
              >
                <div className="text-eu-accent mb-2">
                  <NoteIcon className="w-7 h-7" />
                </div>
                <p className="text-sm font-medium text-eu-text truncate">{it.n.title || "Note"}</p>
                <p className="text-[11px] text-eu-muted mt-0.5 truncate">
                  {it.n.course_id ? `${courseEmoji(it.n.course_id)} ${courseName(it.n.course_id)}` : "Note"}
                  {" · "}
                  {relativeTime(it.n.updated_at)}
                </p>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
