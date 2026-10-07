import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  Highlighter,
  History,
  Minus,
  MousePointer2,
  PanelLeft,
  PenLine,
  Plus,
  RotateCcw,
  ScanLine,
  Trash2,
  Type,
} from "lucide-react";
import { api, fileUrl, versionUrl, type FileVersion } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { tr } from "../../lib/i18n";
import { keysOf } from "../../lib/keymap";
import { logged, reportError } from "../../lib/report";
import { editors } from "../../stores/editors";
import { useToast } from "../../components/ui";
import { OpenWithButton } from "../../components/OpenWithButton";
import { Toolbar, ToolGroup, ToolSep, ToolSpacer } from "../../components/layout";
import { Icon } from "../../ui/Icon";
import { Menu, type MenuEntry } from "../../ui/Menu";
import { tip } from "../../ui/Tooltip";
import { ColorChoice } from "./ColorChoice";
import { HIGHLIGHT, INK } from "./palette";
import { PdfView, type PdfTool, type PdfViewHandle } from "./PdfView";
import { Thumbnails } from "./Thumbnails";
import { ImageView } from "./ImageView";

const isImage = (name: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);

/** A document tab: a PDF (annotated with PDF.js) or an image (drawn over). */
export default function DocumentPane({
  tabId,
  fileId,
  fileName,
}: {
  tabId: string;
  fileId: number;
  fileName: string;
}) {
  return isImage(fileName) ? (
    <ImageView tabId={tabId} fileId={fileId} fileName={fileName} />
  ) : (
    <PdfPane tabId={tabId} fileId={fileId} fileName={fileName} />
  );
}

/** "20261003_140512" → "3 oct. 2026, 14:05". */
function versionDate(v: FileVersion): string {
  if (v.timestamp === "original") return tr("pdf.original");
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/.exec(v.timestamp);
  if (!m) return v.label || v.timestamp;
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TOOLS: {
  id: PdfTool;
  icon: typeof PenLine;
  label: "pdf.select" | "pdf.pen" | "pdf.highlight" | "pdf.text";
  hint: "pdf.selectTitle" | "pdf.penTitle" | "pdf.highlightTitle" | "pdf.textTitle";
}[] = [
  { id: "select", icon: MousePointer2, label: "pdf.select", hint: "pdf.selectTitle" },
  { id: "pen", icon: PenLine, label: "pdf.pen", hint: "pdf.penTitle" },
  { id: "highlight", icon: Highlighter, label: "pdf.highlight", hint: "pdf.highlightTitle" },
  { id: "text", icon: Type, label: "pdf.text", hint: "pdf.textTitle" },
];

function PdfPane({ tabId, fileId, fileName }: { tabId: string; fileId: number; fileName: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const viewRef = useRef<PdfViewHandle>(null);
  const [tool, setTool] = useState<PdfTool>("select");
  const [ink, setInk] = useState(INK[2].value);
  const [marker, setMarker] = useState(HIGHLIGHT[0].value);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageText, setPageText] = useState("1");
  const [scale, setScale] = useState(1);
  const [showPages, setShowPages] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The file's address, taken again after a restore (the file changed underneath). */
  const [current, setCurrent] = useState(() => ({ url: fileUrl(fileId), revision: 0 }));
  /** An older version shown instead of the file (read-only). */
  const [viewing, setViewing] = useState<FileVersion | null>(null);
  const [versionsAnchor, setVersionsAnchor] = useState<HTMLElement | null>(null);
  const versions = useQuery({
    queryKey: ["library", "versions", fileId],
    queryFn: () => api.getFileVersions(fileId),
  });

  useEffect(() => {
    editors.setDirty(tabId, dirty);
  }, [tabId, dirty]);

  const save = useCallback(async () => {
    const view = viewRef.current;
    if (!view || viewing) return;
    setSaving(true);
    try {
      const bytes = await view.save();
      // The file is replaced; what it was becomes a version (write_file_bytes).
      await api.writeFileBytes(fileId, bytes);
      view.markSaved();
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["library", "versions", fileId] });
      window.dispatchEvent(new CustomEvent("eu:library-changed"));
    } catch (err) {
      reportError("pdf.save", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [fileId, queryClient, toast, viewing]);

  useEffect(() => editors.registerFlush(tabId, save), [tabId, save]);

  const restore = async (v: FileVersion) => {
    try {
      const res = await fetch(versionUrl(v.id));
      if (!res.ok) throw new Error(await res.text());
      await api.writeFileBytes(fileId, new Uint8Array(await res.arrayBuffer()));
      setViewing(null);
      setDirty(false);
      setCurrent((c) => ({ url: fileUrl(fileId), revision: c.revision + 1 }));
      void queryClient.invalidateQueries({ queryKey: ["library", "versions", fileId] });
      window.dispatchEvent(new CustomEvent("eu:library-changed"));
      toast(tr("pdf.restored"), "success");
    } catch (err) {
      reportError("pdf.restore", err);
      toast(errorMessage(err, tr("pdf.versionLoadError")), "error");
    }
  };

  const source = viewing ? { url: versionUrl(viewing.id) } : { url: current.url };
  // Each document gets a view of its own (a restored file is a new document).
  const viewKey = viewing ? `version:${viewing.id}` : `file:${current.revision}`;
  // Another document in the view: the last one is closed, forget it.
  const [docFor, setDocFor] = useState(viewKey);
  if (docFor !== viewKey) {
    setDocFor(viewKey);
    setDoc(null);
  }
  const count = doc?.numPages ?? 0;
  const color = tool === "highlight" ? marker : ink;
  const versionItems: MenuEntry[] = (versions.data ?? [])
    .slice()
    .reverse()
    .map((v) => ({ label: versionDate(v), icon: History, onSelect: () => setViewing(v) }));

  const goTo = (n: number) => {
    const target = Math.min(Math.max(1, n), count || 1);
    viewRef.current?.goTo(target);
    setPageText(String(target));
  };

  return (
    <div className="h-full flex flex-col">
      <Toolbar className="h-9 py-0">
        <ToolGroup>
          <button
            type="button"
            onClick={() => setShowPages((s) => !s)}
            aria-pressed={showPages}
            aria-label={tr("pdf.pagesTitle")}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm eu-btn-toggle"
            {...tip(tr("pdf.pagesTitle"))}
          >
            <Icon icon={PanelLeft} />
          </button>
        </ToolGroup>
        <ToolSep />
        <ToolGroup label={tr("pdf.mode")}>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              aria-pressed={tool === t.id}
              disabled={!doc || !!viewing}
              aria-label={tr(t.label)}
              className="eu-btn-quiet eu-btn-sm eu-btn-toggle"
              {...tip(tr(t.hint))}
            >
              <Icon icon={t.icon} size={14} />
              <span className="hidden @4xl:inline">{tr(t.label)}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => viewRef.current?.deleteSelected()}
            disabled={!doc || !!viewing}
            aria-label={tr("pdf.deleteAnnotation")}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
            {...tip(tr("pdf.deleteAnnotationTitle"))}
          >
            <Icon icon={Trash2} />
          </button>
        </ToolGroup>
        {tool !== "select" && !viewing && (
          <ToolGroup collapse label={tr("pdf.colorsFor")}>
            <ColorChoice
              colors={tool === "highlight" ? HIGHLIGHT : INK}
              value={color}
              onChange={tool === "highlight" ? setMarker : setInk}
            />
          </ToolGroup>
        )}
        <ToolSep />
        <ToolGroup collapse label={tr("pdf.pageInput")}>
          <input
            value={pageText}
            onChange={(e) => setPageText(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") goTo(Number(pageText));
            }}
            onBlur={() => setPageText(String(page))}
            inputMode="numeric"
            aria-label={tr("pdf.pageInput")}
            className="eu-input eu-field-sm w-11 text-center font-mono"
          />
          <span className="font-mono text-caption text-ink-muted whitespace-nowrap">
            {tr("pdf.pageOf", { count: count || "…" })}
          </span>
        </ToolGroup>
        <ToolGroup collapse label={tr("whiteboard.zoom")}>
          <button
            type="button"
            onClick={() => viewRef.current?.zoom(-1)}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            aria-label={tr("pdf.zoomOut")}
            {...tip(tr("pdf.zoomOut"))}
          >
            <Icon icon={Minus} />
          </button>
          <span className="font-mono text-caption text-ink-muted w-11 text-center">
            {Math.round(scale * 100)} %
          </span>
          <button
            type="button"
            onClick={() => viewRef.current?.zoom(1)}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            aria-label={tr("pdf.zoomIn")}
            {...tip(tr("pdf.zoomIn"))}
          >
            <Icon icon={Plus} />
          </button>
          <button
            type="button"
            onClick={() => viewRef.current?.zoom(0)}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            aria-label={tr("pdf.zoomFit")}
            {...tip(tr("pdf.zoomFit"))}
          >
            <Icon icon={ScanLine} />
          </button>
        </ToolGroup>
        <ToolSpacer />
        <ToolGroup collapse label={tr("pdf.versions")}>
          <button
            type="button"
            onClick={(e) => setVersionsAnchor(e.currentTarget)}
            disabled={!versionItems.length}
            className="eu-btn-quiet eu-btn-sm"
            aria-haspopup="menu"
            {...tip(versionItems.length ? tr("pdf.versions") : tr("pdf.noVersionsYet"))}
          >
            <Icon icon={History} size={14} />
            <span className="hidden @3xl:inline">
              {tr("pdf.versions")} ({versionItems.length})
            </span>
          </button>
          <Menu
            open={!!versionsAnchor}
            anchor={versionsAnchor}
            items={versionItems}
            label={tr("pdf.versions")}
            placement="bottom-end"
            onClose={() => setVersionsAnchor(null)}
          />
        </ToolGroup>
        <ToolGroup>
          <OpenWithButton fileId={fileId} className="eu-btn-quiet eu-btn-sm" label={tr("openWith.label")} />
          <button
            type="button"
            onClick={() =>
              void save()
                .then(() => toast(tr("pdf.annotationsSaved", { name: fileName }), "success"))
                .catch(logged("pdf.saveButton"))
            }
            disabled={!dirty || saving || !!viewing}
            className="eu-btn-primary eu-btn-sm"
            {...tip(tr("common.save"), keysOf("save"))}
          >
            {tr("common.save")}
          </button>
        </ToolGroup>
      </Toolbar>

      {viewing && (
        <div className="shrink-0 flex items-center gap-3 px-3 py-1.5 border-b border-line bg-warn-soft text-warn eu-t-small">
          <Icon icon={History} size={14} />
          <span className="flex-1 min-w-0 truncate">
            {viewing.timestamp === "original"
              ? tr("pdf.viewingOriginal")
              : tr("pdf.viewingVersion", { date: versionDate(viewing) })}
          </span>
          <button type="button" onClick={() => void restore(viewing)} className="eu-btn-ghost eu-btn-sm">
            <Icon icon={RotateCcw} size={14} />
            {tr("pdf.restore")}
          </button>
          <button type="button" onClick={() => setViewing(null)} className="eu-btn-quiet eu-btn-sm">
            {tr("pdf.backToCurrent")}
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex bg-stage">
        {showPages && doc && (
          <div className="w-40 shrink-0 border-r border-stage-line bg-stage-alt">
            <Thumbnails doc={doc} page={page} onGo={goTo} />
          </div>
        )}
        <div className="flex-1 min-w-0 relative">
          {failed ? (
            <div className="h-full grid place-items-center p-6">
              <div className="max-w-[44ch] text-center text-stage-ink">
                <p className="eu-t-title">{tr("pdf.openFailed")}</p>
                <p className="eu-t-small text-stage-muted mt-1.5">{tr("pdf.openFailedHint")}</p>
                <p className="eu-t-caption text-stage-muted mt-1 selectable">{failed}</p>
                <div className="mt-4 flex justify-center">
                  <OpenWithButton
                    fileId={fileId}
                    className="eu-btn-ghost eu-btn-sm"
                    label={tr("openWith.label")}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              {!doc && (
                <div className="absolute inset-0 z-10 grid place-items-center text-stage-muted eu-t-small">
                  {tr("pdf.loading")}
                </div>
              )}
              <PdfView
                key={viewKey}
                ref={viewRef}
                source={source}
                tool={viewing ? "select" : tool}
                color={color}
                readOnly={!!viewing}
                onReady={(d) => {
                  setDoc(d);
                  setFailed(null);
                }}
                onPage={(n) => {
                  setPage(n);
                  setPageText(String(n));
                }}
                onScale={setScale}
                onDirty={() => setDirty(true)}
                onError={(err) => {
                  reportError("pdf.open", err);
                  setFailed(errorMessage(err, ""));
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
