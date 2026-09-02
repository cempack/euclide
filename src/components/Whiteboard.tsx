import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Course } from "../lib/api";
import { useTabs } from "../lib/tabs";
import { useToast, useConfirm } from "./ui";
import { DownloadIcon, TrashIcon, UndoIcon, PenIcon, EraserIcon, LineIcon, RectIcon, EllipseIcon, TextIcon } from "./icons";
import { get } from "../lib/i18n";
import { Toolbar, ToolGroup, ToolSep, ToolSpacer } from "./layout";
import { MOD } from "../lib/shortcuts";

const BASIC_COLORS = ["#000000","#f44336","#e91e63","#9c27b0","#2196f3","#3f51b5","#e0e0e0","#ffffff","#00bcd4","#009688","#4caf50","#8bc34a","#cddc39","#ffeb3b","#ffc107","#ff9800","#ff5722","#795548","#607d8b","#90a4ae"];
const SIZES = [3,6,12,18,24,30];

interface Point { x: number; y: number; }
interface Stroke { color: string; size: number; eraser: boolean; pts: Point[]; opacity?: number; }
interface Shape { type: 'line'|'rect'|'ellipse'; x1:number; y1:number; x2:number; y2:number; color:string; size:number; opacity?:number; }
interface TextItem { x:number; y:number; text:string; color:string; size:number; opacity?:number; }
interface BoardDoc { version:1|2; strokes:Stroke[]; shapes?:Shape[]; texts?:TextItem[]; }

export default function Whiteboard({ tabId, fileId, visible = true }: { tabId: string; fileId?: number; visible?: boolean }) {
  const toast = useToast(); const tabs = useTabs(); const confirm = useConfirm();
  const wrapRef = useRef<HTMLDivElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null); const ctxRef = useRef<CanvasRenderingContext2D|null>(null);
  const strokes = useRef<Stroke[]>([]); const shapes = useRef<Shape[]>([]); const texts = useRef<TextItem[]>([]);
  const current = useRef<Stroke|null>(null); const drawing = useRef(false); const startPoint = useRef<Point|null>(null); const currentPos = useRef<Point>({x:0,y:0});
  const history = useRef<('stroke'|'shape'|'text')[]>([]); const textInputRef = useRef<HTMLInputElement>(null); const pendingTextRef = useRef<any>(null); const committingRef = useRef(false); const moveRafRef = useRef(0);
  const editingTextOriginal = useRef<TextItem | null>(null);
  const [color, setColor] = useState(BASIC_COLORS[0]); const [size, setSize] = useState(SIZES[1]);
  const colorPresets = BASIC_COLORS.slice(0,8);
  const [tool, setTool] = useState<'pen'|'eraser'|'line'|'rect'|'ellipse'|'text'>('pen');
  const [opacity, setOpacity] = useState(1); const [courses, setCourses] = useState<Course[]>([]); const [courseId, setCourseId] = useState<number|null>(null);
  const [currentFileId, setCurrentFileId] = useState<number|undefined>(fileId); const [dirty, setDirty] = useState(false); const [itemCount, setItemCount] = useState(0);
  const [zoom, setZoom] = useState(1); const zoomRef = useRef(1); const pageSizeRef = useRef({w:800,h:600}); const [pageSize, setPageSize] = useState({w:800,h:600});
  const [pendingText, setPendingText] = useState<{ normX: number; normY: number; value: string } | null>(null); const [isPanning, setIsPanning] = useState(false); const panStartRef = useRef<any>(null);
  const [versions, setVersions] = useState<any[]>([]);

  useEffect(()=>{zoomRef.current=zoom;},[zoom]);

  const updateCanvasSize = (vw:number, vh:number, z:number) => {
    const pw = Math.max(200, vw*z), ph = Math.max(150, vh*z);
    pageSizeRef.current = {w:pw, h:ph}; setPageSize({w:pw,h:ph});
    const c = canvasRef.current; if(!c) return;
    c.style.width = `${pw}px`; c.style.height = `${ph}px`;
    const d = window.devicePixelRatio||1; c.width = pw*d; c.height=ph*d;
    const ctx = c.getContext('2d')!; ctx.setTransform(d,0,0,d,0,0); ctxRef.current=ctx; redraw();
  };

  const redraw = useCallback(()=>{
    const ctx=ctxRef.current, c=canvasRef.current; if(!ctx||!c) return;
    const {w,h}=pageSizeRef.current; ctx.clearRect(0,0,w,h);
    strokes.current.forEach(s=>{ if(!s.pts.length) return; ctx.save(); ctx.globalCompositeOperation=s.eraser?'destination-out':'source-over'; ctx.strokeStyle=s.color; ctx.lineWidth=s.eraser?s.size*2.5:s.size; ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=s.eraser?1:(s.opacity??1); ctx.beginPath(); ctx.moveTo(s.pts[0].x*w,s.pts[0].y*h); for(let i=1;i<s.pts.length;i++)ctx.lineTo(s.pts[i].x*w,s.pts[i].y*h); if(s.pts.length===1)ctx.lineTo(s.pts[0].x*w+0.1,s.pts[0].y*h+0.1); ctx.stroke(); ctx.restore(); });
    shapes.current.forEach(sh=>{ ctx.save(); ctx.strokeStyle=sh.color; ctx.lineWidth=sh.size; ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=sh.opacity??1; const x1=sh.x1*w,y1=sh.y1*h,x2=sh.x2*w,y2=sh.y2*h; if(sh.type==='line'){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();} else if(sh.type==='rect')ctx.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1)); else if(sh.type==='ellipse'){const cx=(x1+x2)/2,cy=(y1+y2)/2,rx=Math.abs(x2-x1)/2||1,ry=Math.abs(y2-y1)/2||1;ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.stroke();} ctx.restore(); });
    texts.current.forEach(t=>{ ctx.save(); ctx.fillStyle=t.color; ctx.globalAlpha=t.opacity??1; ctx.font=`${t.size}px system-ui,sans-serif`; ctx.textBaseline='top'; ctx.fillText(t.text,t.x*w,t.y*h); ctx.restore(); });
  },[]);

  useEffect(()=>{
    const el=canvasRef.current, w=wrapRef.current; if(!el||!w) return;
    const ro=new ResizeObserver(es=>{ const e=es[0]; updateCanvasSize(e.contentRect.width,e.contentRect.height,zoomRef.current); }); ro.observe(w);
    const r = w.getBoundingClientRect(); updateCanvasSize(r.width,r.height,zoomRef.current);
    return ()=>ro.disconnect();
  },[]);

  useEffect(()=>{ const w=wrapRef.current; if(w){ const r=w.getBoundingClientRect(); if(r.width>0) updateCanvasSize(r.width,r.height,zoom); } },[zoom]);

  useEffect(() => {
    if (!visible) return;
    const w = wrapRef.current;
    if (!w) return;
    requestAnimationFrame(() => {
      const r = w.getBoundingClientRect();
      if (r.width > 0) updateCanvasSize(r.width, r.height, zoomRef.current);
    });
  }, [visible]);

  useEffect(() => {
    tabs.setTabDirty(tabId, dirty);
    return () => tabs.setTabDirty(tabId, false);
  }, [tabId, dirty, tabs]);

  useEffect(()=>{
    api.listCourses().then((c) => setCourses(Array.isArray(c) ? c : [])).catch(()=>{}); if(fileId) api.readBoard(fileId).then(raw=>{ try{ if(typeof raw !== "string" || !raw) return; const d=JSON.parse(raw) as BoardDoc; if(!d || typeof d !== "object") return; if(pendingText||pendingTextRef.current||editingTextOriginal.current){ editingTextOriginal.current=null; setPendingText(null); pendingTextRef.current=null; } strokes.current=d.strokes??[]; shapes.current=d.shapes??[]; texts.current=d.texts??[]; history.current=[]; setItemCount(strokes.current.length+shapes.current.length+texts.current.length); const rr=wrapRef.current?.getBoundingClientRect(); if(rr&&rr.width>0)updateCanvasSize(rr.width,rr.height,zoomRef.current); redraw(); }catch{} }).catch(()=>{});
  },[fileId]);

  // load + ensure original version snapshot for this board (so default counts as version, like PDF)
  useEffect(() => {
    const fid = currentFileId ?? fileId;
    if (fid) {
      (async () => {
        try { await api.ensureOriginalVersion(fid); } catch {}
        try {
          const v = await api.getFileVersions(fid);
          setVersions(v);
        } catch { setVersions([]); }
      })();
    }
  }, [fileId, currentFileId]);

  const norm=(e:React.PointerEvent):Point=>{ const r=canvasRef.current!.getBoundingClientRect(); const ww=pageSizeRef.current.w||r.width||800, hh=pageSizeRef.current.h||r.height||600; return {x:(e.clientX-r.left)/ww, y:(e.clientY-r.top)/hh}; };
  const getItemCount = ()=>strokes.current.length+shapes.current.length+texts.current.length;

  const findTextAt = (p: Point): number => {
    const {w, h} = pageSizeRef.current;
    const temp = document.createElement('canvas');
    const tctx = temp.getContext('2d')!;
    for (let i = texts.current.length - 1; i >= 0; i--) {
      const t = texts.current[i];
      tctx.font = `${t.size}px system-ui, sans-serif`;
      const m = tctx.measureText(t.text);
      const tw = m.width / w;
      const th = (t.size * 1.3) / h; // approximate line height
      if (p.x >= t.x && p.x <= t.x + tw && p.y >= t.y && p.y <= t.y + th) {
        return i;
      }
    }
    return -1;
  };

  const startPan=(e:React.PointerEvent)=>{ const w=wrapRef.current; if(!w)return; setIsPanning(true); panStartRef.current={cx:e.clientX,cy:e.clientY,sl:w.scrollLeft,st:w.scrollTop}; (e.currentTarget as any).setPointerCapture?.(e.pointerId); };
  const doPan=(e:React.PointerEvent)=>{ const w=wrapRef.current, s=panStartRef.current; if(!w||!s)return; w.scrollLeft=s.sl-(e.clientX-s.cx); w.scrollTop=s.st-(e.clientY-s.cy); };
  const endPan=()=>{setIsPanning(false);panStartRef.current=null;};

  const start=(e:React.PointerEvent)=>{ if(e.button===1||(e.button===0&&e.altKey)){startPan(e);return;} const p=norm(e); startPoint.current=p; currentPos.current=p;
    if(tool==='pen'||tool==='eraser'||tool==='line'||tool==='rect'||tool==='ellipse'){ drawing.current=true; (e.target as Element).setPointerCapture(e.pointerId); if(tool==='pen'||tool==='eraser') current.current={color,size,eraser:tool==='eraser',pts:[p],opacity:tool==='pen'?opacity:1}; }
    else if(tool==='text'){ if(pendingText||pendingTextRef.current){commitPendingText();} const r=canvasRef.current!.getBoundingClientRect(); if(r.width<10||!isFinite(p.x)||!isFinite(p.y))return; e.preventDefault?.();
      const hit = findTextAt(p);
      if (hit >= 0) {
        const item = texts.current.splice(hit, 1)[0];
        editingTextOriginal.current = { ...item };
        redraw();
        setPendingText({normX: item.x, normY: item.y, value: item.text });
      } else {
        editingTextOriginal.current = null;
        setPendingText({normX:p.x,normY:p.y,value:''});
      }
      drawing.current=false; try{(e.target as Element).releasePointerCapture(e.pointerId);}catch{} }
  };
  const move=(e:React.PointerEvent)=>{ if(isPanning){doPan(e);return;} cancelAnimationFrame(moveRafRef.current); moveRafRef.current = requestAnimationFrame(()=>{ if(!drawing.current||!ctxRef.current)return; const p=norm(e); currentPos.current=p; const {w,h}=pageSizeRef.current, ctx=ctxRef.current;
    if(tool==='pen'||tool==='eraser'){ if(!current.current)return; const s=current.current, prev=s.pts[s.pts.length-1]; s.pts.push(p); ctx.save(); ctx.globalCompositeOperation=s.eraser?'destination-out':'source-over'; ctx.strokeStyle=s.color; ctx.lineWidth=s.eraser?s.size*2.5:s.size; ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=s.eraser?1:(s.opacity??1); ctx.beginPath(); ctx.moveTo(prev.x*w,prev.y*h); ctx.lineTo(p.x*w,p.y*h); ctx.stroke(); ctx.restore(); }
    else if(tool==='line'||tool==='rect'||tool==='ellipse'){ if(!startPoint.current)return; redraw(); const sh={type:tool as any,x1:startPoint.current.x,y1:startPoint.current.y,x2:p.x,y2:p.y,color,size,opacity}; const ctx2=ctxRef.current!; ctx2.save(); ctx2.strokeStyle=color; ctx2.lineWidth=size; const x1=sh.x1*w,y1=sh.y1*h,x2=sh.x2*w,y2=sh.y2*h; if(tool==='line'){ctx2.beginPath();ctx2.moveTo(x1,y1);ctx2.lineTo(x2,y2);ctx2.stroke();}else if(tool==='rect')ctx2.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1)); else {const cx=(x1+x2)/2,cy=(y1+y2)/2,rx=Math.abs(x2-x1)/2||1,ry=Math.abs(y2-y1)/2||1; ctx2.beginPath(); ctx2.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); ctx2.stroke();} ctx2.restore(); }
  }); };
  const end=(e?:React.PointerEvent)=>{ if(isPanning){endPan(); if(e)try{(e.target as Element)?.releasePointerCapture(e.pointerId);}catch{} return;} if(!drawing.current)return; const p=currentPos.current;
    if(tool==='pen'||tool==='eraser'){ if(current.current&&current.current.pts.length){strokes.current.push(current.current); history.current.push('stroke'); setDirty(true);} current.current=null; }
    else if(tool==='line'||tool==='rect'||tool==='ellipse'){ if(startPoint.current){ shapes.current.push({type:tool as any,x1:startPoint.current.x,y1:startPoint.current.y,x2:p.x,y2:p.y,color,size,opacity}); history.current.push('shape'); setDirty(true); } }
    else if(tool==='text'){ if(pendingText || pendingTextRef.current){ cancelPendingText(); } else {drawing.current=false;startPoint.current=null;} return; }
    drawing.current=false; startPoint.current=null; setItemCount(getItemCount()); redraw();
  };

  const undo=()=>{ if(!history.current.length)return; const l=history.current.pop()!; if(l==='stroke'&&strokes.current.length)strokes.current.pop(); else if(l==='shape'&&shapes.current.length)shapes.current.pop(); else if(l==='text'&&texts.current.length)texts.current.pop(); setItemCount(getItemCount()); setDirty(true); redraw(); };
  const clear=async()=>{ if(itemCount===0)return; const ok = await confirm.ask({ title: get("whiteboard.clearAll","Effacer"), message: get("whiteboard.clearConfirm","Effacer tout le tableau ?"), confirmLabel: get("whiteboard.clearAll","Effacer"), danger: true }); if(!ok) return; if(pendingText||pendingTextRef.current){ editingTextOriginal.current = null; setPendingText(null);pendingTextRef.current=null;} strokes.current=[];shapes.current=[];texts.current=[];history.current=[];setItemCount(0);setDirty(true);redraw(); };
  const save=async()=>{
    try {
      if(pendingText||pendingTextRef.current)commitPendingText();
      const doc:BoardDoc={version:2,strokes:strokes.current,shapes:shapes.current,texts:texts.current};
      const f=await api.saveBoard({file_id:currentFileId??null,course_id:courseId,json:JSON.stringify(doc)});
      if(!f?.id){ toast(get("messages.genericError","Erreur"),"error"); return; }
      setCurrentFileId(f.id);
      if (!currentFileId && f.id) {
        tabs.retarget(tabId, `whiteboard:${f.id}`, f.name, { fileId: f.id, isNew: false });
      } else {
        tabs.rename(tabId,f.name);
      }
      api.logEvent('whiteboard_save',f.name,courseId); setDirty(false); toast(get("whiteboard.saved","Enregistré"),"success"); window.dispatchEvent(new CustomEvent('eu:library-changed'));
      api.ensureOriginalVersion(f.id).catch(()=>{}).then(() => { api.getFileVersions(f.id).then(setVersions).catch(()=>{}); });
    } catch {
      toast(get("messages.genericError","Erreur"),"error");
    }
  };
  const exportPng=async()=>{
    try {
      if(pendingText||pendingTextRef.current)commitPendingText(); redraw();
      const c=canvasRef.current!, o=document.createElement('canvas'); o.width=c.width;o.height=c.height; const oc=o.getContext('2d')!; oc.fillStyle='#fff'; oc.fillRect(0,0,o.width,o.height); oc.drawImage(c,0,0);
      const exported = await api.exportBoardPng(courseId,tabs.tabs.find(t=>t.id===tabId)?.title??'Tableau',o.toDataURL('image/png'));
      if(!exported?.id){ toast(get("messages.genericError","Erreur"),"error"); return; }
      toast(get("whiteboard.exported","Exporté"),"success");
    } catch {
      toast(get("messages.genericError","Erreur"),"error");
    }
  };

  useEffect(() => {
    return tabs.registerFlush(tabId, save);
  }, [tabId, tabs, currentFileId, courseId, dirty]);
  const zoomIn=()=>setZoom(z=>Math.min(4,z*1.25)); const zoomOut=()=>setZoom(z=>Math.max(.25,z/1.25)); const resetZoom=()=>setZoom(1);

  const cancelPendingText = () => {
    if (editingTextOriginal.current) {
      texts.current.push(editingTextOriginal.current);
      editingTextOriginal.current = null;
    }
    setPendingText(null);
    pendingTextRef.current = null;
    drawing.current = false;
    startPoint.current = null;
    setItemCount(getItemCount());
    redraw();
  };

  const commitPendingText = () => {
    if (committingRef.current) return;
    committingRef.current = true;
    const cur = pendingTextRef.current || pendingText;
    if (!cur || !cur.value.trim()) {
      // empty commit: for edit this deletes the text (do not restore)
      if (editingTextOriginal.current) {
        editingTextOriginal.current = null;
      }
      setPendingText(null);
      pendingTextRef.current = null;
      drawing.current = false;
      startPoint.current = null;
      setItemCount(getItemCount());
      redraw();
      setTimeout(() => { committingRef.current = false; }, 0);
      return;
    }
    // has value: add or update
    let textItem: TextItem;
    if (editingTextOriginal.current) {
      textItem = {
        ...editingTextOriginal.current,
        text: cur.value.trim(),
        x: cur.normX,
        y: cur.normY,
      };
      editingTextOriginal.current = null;
    } else {
      textItem = { x: cur.normX, y: cur.normY, text: cur.value.trim(), color, size: Math.max(14, size * 2), opacity };
    }
    texts.current.push(textItem);
    history.current.push('text');
    setDirty(true);
    setItemCount(getItemCount());
    redraw();
    setPendingText(null);
    pendingTextRef.current = null;
    drawing.current = false;
    startPoint.current = null;
    setTimeout(() => { committingRef.current = false; }, 0);
  };

  useEffect(()=>{ pendingTextRef.current=pendingText; if(pendingText&&textInputRef.current)setTimeout(()=>textInputRef.current?.focus(),0); },[pendingText]);
  useEffect(()=>{ const c=canvasRef.current; if(!c)return; c.style.cursor=isPanning?'grabbing':(tool==='text'?'text':tool==='eraser'?'cell':'crosshair'); },[isPanning,tool]);
  useEffect(()=>{ const kd=(e:KeyboardEvent)=>{const c=canvasRef.current;if(c&&!isPanning&&e.key==='Alt'&&!e.repeat)c.style.cursor='grab';}; const ku=(e:KeyboardEvent)=>{const c=canvasRef.current;if(c&&!isPanning&&e.key==='Alt')c.style.cursor=tool==='text'?'text':tool==='eraser'?'cell':'crosshair';}; window.addEventListener('keydown',kd);window.addEventListener('keyup',ku); return ()=>{window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);}; },[tool,isPanning]);


  return (
    <div className="h-full flex flex-col">
      <Toolbar className="h-9 py-0">
        {/* Tools */}
        <ToolGroup label={get("whiteboard.tools", "Outils")}>
          {(['pen','eraser','line','rect','ellipse','text'] as const).map((t) => {
            const Icon = t === 'pen' ? PenIcon : t === 'eraser' ? EraserIcon : t === 'line' ? LineIcon : t === 'rect' ? RectIcon : t === 'ellipse' ? EllipseIcon : TextIcon;
            const label = get(`whiteboard.tool_${t}`, t);
            return (
              <button
                key={t}
                onClick={() => { if (pendingText && t !== 'text') commitPendingText(); setTool(t); }}
                aria-pressed={tool === t}
                aria-label={label}
                title={label}
                className={`eu-btn-icon eu-btn-sm eu-no-drag ${tool === t ? 'eu-btn-primary' : 'eu-btn-quiet'}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </ToolGroup>

        <ToolSep />

        {/* Colours */}
        <ToolGroup label={get("whiteboard.colors", "Couleurs")}>
          {colorPresets.map((c) => (
            <button
              key={c}
              onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }}
              aria-label={c}
              aria-pressed={color === c && tool !== 'eraser'}
              className={`w-5 h-5 rounded-full border eu-no-drag transition-transform duration-fast ${color === c && tool !== 'eraser' ? 'border-ink scale-110' : 'border-line hover:scale-105'}`}
              style={{ background: c }}
            />
          ))}
          <span
            className={`relative w-5 h-5 rounded-full border overflow-hidden cursor-pointer eu-no-drag ${!colorPresets.includes(color) && tool !== 'eraser' ? 'border-ink' : 'border-line'}`}
            title={get("whiteboard.customColor", "Couleur personnalisée")}
          >
            <input
              type="color"
              value={color}
              onChange={(e) => { const c = e.target.value; setColor(c); if (tool === 'eraser') setTool('pen'); }}
              className="absolute inset-0 opacity-0 w-full h-full eu-no-drag cursor-pointer"
              aria-label={get("whiteboard.customColor", "Couleur personnalisée")}
            />
            <span className="block w-full h-full" style={{ background: color }} />
          </span>
        </ToolGroup>

        <ToolSep />

        {/* Stroke width */}
        <ToolGroup label={get("whiteboard.sizes", "Épaisseurs")}>
          {SIZES.slice(0, 5).map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              aria-pressed={size === s}
              aria-label={`${s} px`}
              title={`${s} px`}
              className={`w-6 h-6 grid place-items-center rounded border eu-no-drag transition-colors duration-fast ${size === s ? 'border-ink bg-panel-alt' : 'border-line hover:bg-panel-alt'}`}
            >
              <span className="rounded-full bg-ink block" style={{ width: Math.max(3, Math.min(s, 9)), height: Math.max(3, Math.min(s, 9)) }} />
            </button>
          ))}
        </ToolGroup>

        <ToolSep />

        {/* Opacity */}
        <button
          onClick={() => setOpacity(opacity === 1 ? 0.35 : 1)}
          role="switch"
          aria-checked={opacity < 1}
          aria-label={get("whiteboard.opacity", "Semi-transparent")}
          title={get("whiteboard.opacity", "Semi-transparent")}
          className={`eu-btn-sm eu-no-drag ${opacity < 1 ? 'eu-btn-primary' : 'eu-btn-quiet'}`}
        >
          {get("whiteboard.opacityShort", "Opacité")}
        </button>

        <ToolSep />

        {/* Zoom */}
        <ToolGroup label={get("whiteboard.zoom", "Zoom")}>
          <button onClick={zoomOut} aria-label={get("whiteboard.zoomOut", "Réduire")} className="eu-btn-quiet eu-btn-icon eu-btn-sm eu-no-drag">−</button>
          <button onClick={resetZoom} className="eu-btn-quiet eu-btn-sm eu-no-drag font-mono tabular-nums w-12" title={get("whiteboard.zoomReset", "Réinitialiser le zoom")}>
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={zoomIn} aria-label={get("whiteboard.zoomIn", "Agrandir")} className="eu-btn-quiet eu-btn-icon eu-btn-sm eu-no-drag">+</button>
        </ToolGroup>

        <ToolSep />

        {/* History */}
        <ToolGroup label={get("whiteboard.history", "Historique")}>
          <button onClick={undo} disabled={itemCount === 0} aria-label={get("whiteboard.undo", "Annuler")} title={get("whiteboard.undo", "Annuler")} className="eu-btn-quiet eu-btn-icon eu-btn-sm">
            <UndoIcon className="w-3.5 h-3.5" />
          </button>
          <button onClick={clear} disabled={itemCount === 0} aria-label={get("whiteboard.clear", "Tout effacer")} title={get("whiteboard.clear", "Tout effacer")} className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger">
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </ToolGroup>

        <ToolSep />

        {/* Versions: load an earlier snapshot, then Enregistrer to promote it. */}
        <select
          className="eu-select h-7 w-[130px] text-[11.5px] eu-no-drag"
          value=""
          aria-label={get("pdf.versions", "Versions")}
          onChange={async (e) => {
              const name = e.target.value;
              if (!name) return;
              try {
                const dataUrl = await api.readVersionData(name);
                const res = await fetch(dataUrl);
                const txt = await res.text();
                const d = JSON.parse(txt) as BoardDoc;
                if (pendingText || pendingTextRef.current) { editingTextOriginal.current = null; setPendingText(null); pendingTextRef.current = null; }
                strokes.current = d.strokes ?? [];
                shapes.current = d.shapes ?? [];
                texts.current = d.texts ?? [];
                history.current = [];
                setItemCount(strokes.current.length + shapes.current.length + texts.current.length);
                const rr = wrapRef.current?.getBoundingClientRect();
                if (rr && rr.width > 0) updateCanvasSize(rr.width, rr.height, zoomRef.current);
                redraw();
                setDirty(true);
                toast(get("pdf.versionLoaded", "Version chargée — modifiez et Enregistrer pour appliquer"), "success");
              } catch {
                toast(get("pdf.versionLoadError", "Erreur chargement de la version"), "error");
              }
              }}
        >
          <option value="" disabled>
            {get("pdf.versions", "Versions")} ({versions.length})
          </option>
          {versions.length === 0 ? (
            <option value="" disabled>
              {get("pdf.noVersionsYet", "Aucune version")}
            </option>
          ) : (
            versions
              .slice()
              .reverse()
              .map((v: any, i: number) => {
                const isOrig =
                  v.timestamp === "original" ||
                  (typeof v.backup_name === "string" && v.backup_name.includes("original"));
                const label = isOrig ? get("pdf.original", "Original") : `v${v.version} ${v.timestamp}`;
                return (
                  <option key={i} value={v.backup_name}>
                    {label}
                  </option>
                );
              })
          )}
        </select>

        <ToolSpacer />

        {/* Destination course + export + save */}
        <ToolGroup>
          <select
            value={courseId ?? ""}
            onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : null)}
            className="eu-select h-7 w-[130px] text-[11.5px] eu-no-drag"
            aria-label={get("whiteboard.course", "Cours")}
          >
            <option value="">{get("whiteboard.noCourse", "Sans cours")}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={exportPng}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm eu-no-drag"
            aria-label={get("whiteboard.exportPng", "Exporter en PNG")}
            title={get("whiteboard.exportPng", "Exporter en PNG")}
          >
            <DownloadIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={save}
            className="eu-btn-primary eu-btn-sm eu-no-drag"
            title={`${get("common.save", "Enregistrer")} (${MOD}S)`}
          >
            {get("common.save", "Enregistrer")}
            {dirty && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
          </button>
        </ToolGroup>
      </Toolbar>

      <div ref={wrapRef} className="flex-1 min-h-0 bg-panel-alt overflow-auto eu-no-drag" onWheel={e=>{if((e.ctrlKey||e.metaKey)&&wrapRef.current){e.preventDefault();const f=e.deltaY<0?1.1:0.9;setZoom(z=>Math.max(0.25,Math.min(4,z*f)));}}}>
        <div style={{position:'relative',width:`${pageSize.w}px`,height:`${pageSize.h}px`}}>
          <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} className="absolute top-0 left-0 touch-none block eu-no-drag" style={{zIndex: 1}} />
          {pendingText && <input ref={textInputRef} autoFocus value={pendingText.value} onChange={e=>setPendingText(p=>p?{...p,value:e.target.value}:null)} onKeyDown={e=>{if(e.key==='Enter')commitPendingText();else if(e.key==='Escape'){cancelPendingText();}}} onBlur={commitPendingText} onFocus={e=>e.target.select()} className="absolute bg-white text-black border-2 border-accent px-1.5 py-0.5 text-sm outline-none shadow-pop" style={{left:`${pendingText.normX*pageSize.w}px`,top:`${pendingText.normY*pageSize.h}px`,minWidth:'120px',width:`${Math.max(120, (pendingText.value.length || 8) * 8 + 16)}px`,height:'28px',zIndex:20,fontFamily:'system-ui,sans-serif',boxSizing:'border-box'}}/>}
        </div>
      </div>
    </div>
  );
}
