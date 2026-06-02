import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Course } from "../lib/api";
import { useTabs } from "../lib/tabs";
import { useToast } from "./ui";
import { DownloadIcon, TrashIcon, UndoIcon } from "./icons";

const PALETTE = ["#1f1f1f", "#fa520f", "#ff8105", "#ffa110", "#ffd06a", "#6a6a6a", "#4a4a4a", "#ffffff"];
const SIZES = [3, 6, 12, 24];

interface Point {
  x: number; // normalized 0..1 so the board scales with the window
  y: number;
}
interface Stroke {
  color: string;
  size: number;
  eraser: boolean;
  pts: Point[];
}
interface BoardDoc {
  version: 1;
  strokes: Stroke[];
}

export default function Whiteboard({ tabId, fileId }: { tabId: string; fileId?: number }) {
  const toast = useToast();
  const tabs = useTabs();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const drawing = useRef(false);

  const [color, setColor] = useState(PALETTE[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [eraser, setEraser] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [currentFileId, setCurrentFileId] = useState<number | undefined>(fileId);
  const [dirty, setDirty] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);

  const cssSize = () => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };

  const redraw = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const { w, h } = cssSize();
    ctx.clearRect(0, 0, w, h);
    for (const s of strokes.current) drawStroke(ctx, s, w, h);
  }, []);

  const drawStroke = (ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) => {
    if (s.pts.length === 0) return;
    ctx.globalCompositeOperation = s.eraser ? "destination-out" : "source-over";
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.eraser ? s.size * 2.5 : s.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(s.pts[0].x * w, s.pts[0].y * h);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x * w, s.pts[i].y * h);
    if (s.pts.length === 1) ctx.lineTo(s.pts[0].x * w + 0.1, s.pts[0].y * h + 0.1);
    ctx.stroke();
  };

  // setup canvas + handle resize
  useEffect(() => {
    const canvas = canvasRef.current!;
    const setup = () => {
      const { w, h } = cssSize();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, w * dpr);
      canvas.height = Math.max(1, h * dpr);
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxRef.current = ctx;
      redraw();
    };
    setup();
    const ro = new ResizeObserver(setup);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [redraw]);

  // load courses + existing board
  useEffect(() => {
    api.listCourses().then(setCourses).catch(() => {});
    if (fileId) {
      api
        .readBoard(fileId)
        .then((raw) => {
          try {
            const doc = JSON.parse(raw) as BoardDoc;
            strokes.current = doc.strokes ?? [];
            setStrokeCount(strokes.current.length);
            redraw();
          } catch {
            /* ignore corrupt board */
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const norm = (e: React.PointerEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    current.current = { color, size, eraser, pts: [norm(e)] };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !current.current || !ctxRef.current) return;
    const p = norm(e);
    const s = current.current;
    const { w, h } = cssSize();
    const ctx = ctxRef.current;
    const prev = s.pts[s.pts.length - 1];
    s.pts.push(p);
    ctx.globalCompositeOperation = s.eraser ? "destination-out" : "source-over";
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.eraser ? s.size * 2.5 : s.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(prev.x * w, prev.y * h);
    ctx.lineTo(p.x * w, p.y * h);
    ctx.stroke();
  };
  const end = () => {
    if (current.current && current.current.pts.length) {
      strokes.current.push(current.current);
      setStrokeCount(strokes.current.length);
      setDirty(true);
    }
    current.current = null;
    drawing.current = false;
  };

  const undo = () => {
    strokes.current.pop();
    setStrokeCount(strokes.current.length);
    setDirty(true);
    redraw();
  };
  const clear = () => {
    strokes.current = [];
    setStrokeCount(0);
    setDirty(true);
    redraw();
  };

  const save = async () => {
    const doc: BoardDoc = { version: 1, strokes: strokes.current };
    const f = await api.saveBoard({
      file_id: currentFileId ?? null,
      course_id: courseId,
      json: JSON.stringify(doc),
    });
    setCurrentFileId(f.id);
    tabs.rename(tabId, f.name);
    api.logEvent("whiteboard_save", f.name, courseId);
    setDirty(false);
    toast("Tableau enregistre", "success");
  };

  const exportPng = async () => {
    const canvas = canvasRef.current!;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext("2d")!;
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    const f = await api.exportBoardPng(courseId, tabs.tabs.find((t) => t.id === tabId)?.title ?? "Tableau", out.toDataURL("image/png"));
    toast(`Exporte : ${f.name}`, "success");
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-[#ededed] flex-wrap bg-[#fffaeb]">
        <div className="flex items-center gap-1.5">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => {
                setColor(c);
                setEraser(false);
              }}
              className={`w-6 h-6 rounded-full border border-[#ededed] transition-transform ${
                color === c && !eraser ? "ring-2 ring-[#fa520f] scale-110" : ""
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1 ml-1">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`w-8 h-8 rounded-lg grid place-items-center transition-colors ${
                size === s ? "bg-[#fff8e0]" : "hover:bg-[#fffaeb]"
              }`}
            >
              <span className="rounded-full bg-eu-text" style={{ width: s, height: s }} />
            </button>
          ))}
        </div>
        <button
          onClick={() => setEraser((e) => !e)}
          className={`eu-btn-ghost ${eraser ? "bg-[#fff8e0] text-[#fa520f]" : "text-[#6a6a6a]"}`}
        >
          Gomme
        </button>
        <button onClick={undo} disabled={strokeCount === 0} className="eu-btn-ghost text-[#6a6a6a]">
          <UndoIcon className="w-4 h-4" /> Annuler
        </button>
        <button onClick={clear} disabled={strokeCount === 0} className="eu-btn-ghost text-[#6a6a6a]">
          <TrashIcon className="w-4 h-4" /> Effacer
        </button>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={courseId ?? ""}
            onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : null)}
            className="eu-input w-auto py-1.5"
          >
            <option value="">Sans cours</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
          <button onClick={exportPng} className="eu-btn-ghost text-[#6a6a6a]" title="Exporter en PNG">
            <DownloadIcon className="w-4 h-4" />
          </button>
          <button onClick={save} className="eu-btn-primary">
            {dirty ? "Enregistrer *" : "Enregistrer"}
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="flex-1 min-h-0 bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="w-full h-full touch-none block"
          style={{ cursor: "crosshair" }}
        />
      </div>
    </div>
  );
}
