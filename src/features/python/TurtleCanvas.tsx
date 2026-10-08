import { useEffect, useRef } from "react";
import type { TurtleOp } from "../../lib/api";

type Point = [number, number];
type Pen = { x: number; y: number; heading: number; visible: boolean };

/** The standard turtle window, in turtle units: scaled to fit the pane. */
const WORLD: Point = [640, 480];
/** Distance drawn per frame, by turtle speed (1 slowest … 10 fast; 0 instant). */
const STEP = [Infinity, 2, 3, 4, 6, 8, 11, 15, 20, 28, 40];

type Scene = {
  ctx: CanvasRenderingContext2D;
  /** Screen colour, under the drawing (the drawing itself is transparent). */
  background: string;
  scale: number;
  dpr: number;
  width: number;
  height: number;
};

/** Applies one operation, whole, to the finished drawing. */
function draw(scene: Scene, op: TurtleOp, pens: Map<number, Pen>, upTo = 1) {
  const { ctx } = scene;
  const at = (p: Point): Point => [
    scene.width / 2 + p[0] * scene.scale,
    scene.height / 2 - p[1] * scene.scale,
  ];
  switch (op.op) {
    case "line": {
      const from = op.from as Point;
      const to = op.to as Point;
      const end: Point = [from[0] + (to[0] - from[0]) * upTo, from[1] + (to[1] - from[1]) * upTo];
      const [ax, ay] = at(from);
      const [bx, by] = at(end);
      ctx.strokeStyle = String(op.color);
      ctx.lineWidth = Math.max(1, Number(op.width) * scene.scale);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      if (upTo >= 1) setPen(pens, op, { x: to[0], y: to[1] });
      break;
    }
    case "move": {
      const to = op.to as Point;
      setPen(pens, op, { x: to[0], y: to[1] });
      break;
    }
    case "heading":
      setPen(pens, op, { heading: Number(op.heading) });
      break;
    case "visible":
      setPen(pens, op, { visible: Boolean(op.visible) });
      break;
    case "turtle":
      pens.set(Number(op.id), { x: 0, y: 0, heading: 0, visible: Boolean(op.visible) });
      break;
    case "fill": {
      // As in the standard turtle, the fill goes under the outline drawn.
      const points = (op.points as Point[]).map(at);
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = String(op.color);
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case "dot": {
      const [x, y] = at(op.at as Point);
      ctx.fillStyle = String(op.color);
      ctx.beginPath();
      ctx.arc(x, y, (Number(op.size) / 2) * scene.scale, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "text": {
      const [x, y] = at(op.at as Point);
      const [family, size, style] = op.font as [string, number, string];
      ctx.fillStyle = String(op.color);
      ctx.font = `${style.includes("bold") ? "600 " : ""}${style.includes("italic") ? "italic " : ""}${Math.max(
        8,
        size * 1.33 * scene.scale,
      )}px ${family}, sans-serif`;
      ctx.textAlign = op.align === "center" ? "center" : op.align === "right" ? "right" : "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(String(op.text), x, y);
      break;
    }
    case "bg":
      scene.background = String(op.color);
      break;
    case "clear":
      ctx.clearRect(0, 0, scene.width, scene.height);
      break;
  }
}

function setPen(pens: Map<number, Pen>, op: TurtleOp, patch: Partial<Pen>) {
  const id = Number(op.id);
  const pen = pens.get(id) ?? { x: 0, y: 0, heading: 0, visible: true };
  pens.set(id, { ...pen, ...patch });
}

function length(op: TurtleOp): number {
  if (op.op !== "line" && op.op !== "move") return 0;
  const to = op.to as Point;
  const from = (op.from as Point | undefined) ?? to;
  return Math.hypot(to[0] - from[0], to[1] - from[1]);
}

/** The classic arrow, pointing along the heading. */
function drawPen(scene: Scene, pen: Pen) {
  const { ctx } = scene;
  const x = scene.width / 2 + pen.x * scene.scale;
  const y = scene.height / 2 - pen.y * scene.scale;
  const a = (-pen.heading * Math.PI) / 180;
  const s = 9;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = "#111213";
  ctx.beginPath();
  ctx.moveTo(s, 0);
  ctx.lineTo(-s * 0.7, s * 0.6);
  ctx.lineTo(-s * 0.35, 0);
  ctx.lineTo(-s * 0.7, -s * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * The turtle's drawing, animated at the speed the script asked for (speed(0)
 * or tracer(0): at once). Finished operations are kept on an offscreen
 * canvas; each frame adds the line being drawn and the turtles on top.
 */
export function TurtleCanvas({ ops, label }: { ops: TurtleOp[]; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opsRef = useRef(ops);
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    opsRef.current = ops;
    kick.current();
  }, [ops]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const paper = document.createElement("canvas");
    let scene: Scene | null = null;
    let done = 0; // operations on the paper
    let progress = 0; // of the operation being animated, in turtle units
    let instant = false;
    let world: Point = WORLD;
    let pens = new Map<number, Pen>();
    let frame = 0;

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      for (const c of [canvas, paper]) {
        c.width = Math.max(1, Math.round(rect.width * dpr));
        c.height = Math.max(1, Math.round(rect.height * dpr));
      }
      const ctx = paper.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene = {
        ctx,
        background: scene?.background ?? "#ffffff",
        dpr,
        width: rect.width,
        height: rect.height,
        scale: Math.min(rect.width / world[0], rect.height / world[1]),
      };
      // Redraw everything finished so far, at once, at the new size.
      ctx.clearRect(0, 0, rect.width, rect.height);
      pens = new Map();
      const list = opsRef.current;
      for (let i = 0; i < done && i < list.length; i++) draw(scene, list[i], pens);
    };

    const paint = () => {
      if (!scene) return;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = scene.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(paper, 0, 0);
      ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
      const list = opsRef.current;
      const current = list[done];
      const overlay = { ...scene, ctx };
      const shown = new Map(pens);
      if (current && (current.op === "line" || current.op === "move") && progress > 0) {
        const total = length(current) || 1;
        const t = Math.min(1, progress / total);
        if (current.op === "line") draw(overlay, current, new Map(), t);
        const from = (current.from as Point | undefined) ?? [
          pens.get(Number(current.id))?.x ?? 0,
          pens.get(Number(current.id))?.y ?? 0,
        ];
        const to = current.to as Point;
        const pen = shown.get(Number(current.id));
        if (pen)
          shown.set(Number(current.id), {
            ...pen,
            x: from[0] + (to[0] - from[0]) * t,
            y: from[1] + (to[1] - from[1]) * t,
          });
      }
      for (const pen of shown.values()) if (pen.visible) drawPen(overlay, pen);
    };

    const step = () => {
      frame = 0;
      if (!scene) return;
      const list = opsRef.current;
      if (list.length < done) {
        // A new run: start over.
        done = 0;
        progress = 0;
        instant = false;
        world = WORLD;
        if (scene) scene.background = "#ffffff";
        layout();
      }
      let budget = 4000; // operations applied per frame, at most
      while (done < list.length && budget-- > 0) {
        const op = list[done];
        if (op.op === "tracer") instant = !op.on;
        if (op.op === "size") {
          world = [Number(op.width), Number(op.height)];
          layout();
        }
        const speed = Number(op.speed ?? 0);
        const total = length(op);
        if (!instant && speed > 0 && total > 0) {
          progress += STEP[speed] ?? 8;
          if (progress < total) break;
        }
        draw(scene, op, pens);
        done += 1;
        progress = 0;
        if (!instant && speed > 0 && total > 0) break; // one animated move per frame
      }
      paint();
      if (done < list.length) frame = requestAnimationFrame(step);
    };

    kick.current = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };
    const ro = new ResizeObserver(() => {
      layout();
      paint();
    });
    ro.observe(canvas);
    layout();
    kick.current();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      kick.current = () => {};
    };
  }, []);

  // The canvas sits out of the flow: its pixel size (CSS size × the screen's
  // scale) would otherwise widen its box, which widened it again (on a
  // screen scaled 125 % or more, it grew until the browser gave up).
  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block bg-paper"
        role="img"
        aria-label={label}
      />
    </div>
  );
}

/** The drawing as a PNG, for the library. */
export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
