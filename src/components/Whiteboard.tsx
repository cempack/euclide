import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Course } from "../lib/api";
import { useTabs } from "../lib/tabs";
import { useToast } from "./ui";
import { DownloadIcon, TrashIcon, UndoIcon, PenIcon, EraserIcon, LineIcon, RectIcon, EllipseIcon, TextIcon } from "./icons";
import { get } from "../lib/i18n";

const BASIC_COLORS = ["#000000","#f44336","#e91e63","#9c27b0","#2196f3","#3f51b5","#e0e0e0","#ffffff","#00bcd4","#009688","#4caf50","#8bc34a","#cddc39","#ffeb3b","#ffc107","#ff9800","#ff5722","#795548","#607d8b","#90a4ae"];
const SIZES = [3,6,12,18,24,30];

interface Point { x: number; y: number; }
interface Stroke { color: string; size: number; eraser: boolean; pts: Point[]; opacity?: number; }
interface Shape { type: 'line'|'rect'|'ellipse'; x1:number; y1:number; x2:number; y2:number; color:string; size:number; opacity?:number; }
interface TextItem { x:number; y:number; text:string; color:string; size:number; opacity?:number; }
interface BoardDoc { version:1|2; strokes:Stroke[]; shapes?:Shape[]; texts?:TextItem[]; }

export default function Whiteboard({ tabId, fileId }: { tabId: string; fileId?: number }) {
  const toast = useToast(); const tabs = useTabs();
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
  const clear=()=>{ if(pendingText||pendingTextRef.current){ editingTextOriginal.current = null; setPendingText(null);pendingTextRef.current=null;} strokes.current=[];shapes.current=[];texts.current=[];history.current=[];setItemCount(0);setDirty(true);redraw(); };
  const save=async()=>{
    try {
      if(pendingText||pendingTextRef.current)commitPendingText();
      const doc:BoardDoc={version:2,strokes:strokes.current,shapes:shapes.current,texts:texts.current};
      const f=await api.saveBoard({file_id:currentFileId??null,course_id:courseId,json:JSON.stringify(doc)});
      if(!f?.id){ toast(get("messages.genericError","Erreur"),"error"); return; }
      setCurrentFileId(f.id); tabs.rename(tabId,f.name); api.logEvent('whiteboard_save',f.name,courseId); setDirty(false); toast(get("whiteboard.saved","Enregistré"),"success"); window.dispatchEvent(new CustomEvent('eu:library-changed'));
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
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-hairline flex-wrap bg-surface text-sm">
        <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap pl-1">
          <div className="flex items-center gap-0.5" title="Couleurs">{colorPresets.map(c=><button key={c} onClick={()=>{setColor(c);if(tool==='eraser')setTool('pen');}} className={`w-5 h-5 rounded-full border border-hairline transition-all eu-no-drag ${color===c&&tool!=='eraser'?'ring-2 ring-tui-accent':'hover:ring-1 hover:ring-hairline'}`} style={{background:c}}/>)}<div className={`relative w-5 h-5 rounded border border-hairline overflow-hidden cursor-pointer transition-all eu-no-drag ${!colorPresets.includes(color)&&tool!=='eraser'?'ring-2 ring-tui-accent':'hover:ring-1 hover:ring-hairline'}`}><input type="color" value={color} onChange={e=>{const c=e.target.value;setColor(c);if(tool==='eraser')setTool('pen');}} className="absolute inset-0 opacity-0 w-full h-full eu-no-drag"/><div className="w-full h-full" style={{background:color}}/></div></div>
          <div className="w-px h-5 bg-hairline"/>
          <div className="flex items-center gap-0.5" title="Tailles">{SIZES.slice(0,5).map(s=><button key={s} onClick={()=>setSize(s)} className={`w-5 h-5 border flex items-center justify-center transition-all eu-no-drag ${size===s?'border-tui-accent ring-1 ring-tui-accent bg-tui-accent/5':'border-hairline bg-[#f4f3f3] hover:border-hairline/80'}`} title={s+'px'}><div className="bg-[#111] rounded-sm" style={{width:10,height:Math.max(2,Math.min(s,8))}}/></button>)}</div>
          <div className="w-px h-5 bg-hairline"/>
          <div className="flex items-center gap-1.5 text-xs text-body-mute shrink-0 select-none" title="Opacité">
            <span className="text-[10px]">Opac</span>
            <div
              onClick={() => setOpacity(opacity === 1 ? 0.35 : 1)}
              className={`w-9 h-[18px] rounded-full relative cursor-pointer transition-colors flex-shrink-0 eu-no-drag ${opacity < 1 ? 'bg-tui-accent' : 'bg-[#e2dfdf]'}`}
            >
              <div
                className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all"
                style={{ top: '2px', left: opacity < 1 ? '20px' : '2px' }}
              />
            </div>
          </div>
          <div className="w-px h-5 bg-hairline"/>
          <div className="flex items-center gap-0.5" title={get("whiteboard.tools", "Outils")}>
            {(['pen','eraser','line','rect','ellipse','text'] as const).map((t) => {
              const Icon = t === 'pen' ? PenIcon : t === 'eraser' ? EraserIcon : t === 'line' ? LineIcon : t === 'rect' ? RectIcon : t === 'ellipse' ? EllipseIcon : TextIcon;
              return (
                <button key={t} onClick={() => { if (pendingText && t !== 'text') commitPendingText(); setTool(t); }} className={`w-7 h-7 flex items-center justify-center rounded-sm transition-all eu-no-drag ${tool===t ? 'border border-tui-accent bg-tui-accent/10 text-primary' : 'border border-transparent hover:bg-surface-container/60'}`}>
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
          <div className="w-px h-5 bg-hairline"/>
          <div className="flex items-center text-[11px] border border-hairline rounded-sm overflow-hidden bg-[#f4f3f3]"><button onClick={zoomOut} className="px-1.5 py-0.5 hover:bg-surface-soft active:bg-surface-container/60 border-r border-hairline eu-no-drag">−</button><span className="tabular-nums w-9 text-center cursor-pointer py-0.5 hover:bg-surface-soft eu-no-drag" onClick={resetZoom}>{Math.round(zoom*100)}%</span><button onClick={zoomIn} className="px-1.5 py-0.5 hover:bg-surface-soft active:bg-surface-container/60 border-l border-hairline eu-no-drag">+</button></div>
          <div className="w-px h-5 bg-hairline"/>
          <div className="flex items-center gap-0.5"><button onClick={undo} disabled={itemCount===0} className="new-btn-ghost px-1.5 py-0.5"><UndoIcon className="w-3.5 h-3.5"/></button><button onClick={clear} disabled={itemCount===0} className="new-btn-ghost px-1.5 py-0.5"><TrashIcon className="w-3.5 h-3.5"/></button></div>
          {/* versioning like PDF: original default + prior saves; load snapshot then Enregistrer to promote */}
          <div className="flex items-center gap-1 ml-1 pl-1 border-l border-hairline text-xs">
            <select
              className="new-btn-ghost text-xs px-1 py-0.5"
              value=""
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
              <option value="" disabled>Versions ({versions.length})</option>
              {versions.length === 0 ? (
                <option value="" disabled>(no previous yet - save to create)</option>
              ) : (
                versions.slice().reverse().map((v: any, i: number) => {
                  const isOrig = v.timestamp === "original" || (typeof v.backup_name === "string" && v.backup_name.includes("original"));
                  const label = isOrig ? "Original" : `v${v.version} ${v.timestamp}`;
                  return <option key={i} value={v.backup_name}>{label}</option>;
                })
              )}
            </select>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 pl-2 border-l border-hairline text-xs"><div className="relative"><select value={courseId??''} onChange={e=>setCourseId(e.target.value?Number(e.target.value):null)} className="new-input w-auto py-0.5 text-xs min-w-[78px] appearance-none pr-4 pl-1.5 eu-no-drag"><option value="">Sans cours</option>{courses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><span className="absolute right-[1px] top-1/2 -translate-y-1/2 text-[10px] text-body-mute pointer-events-none select-none">▾</span></div><button onClick={exportPng} className="new-btn-ghost px-1 py-0.5"><DownloadIcon className="w-3.5 h-3.5"/></button><button onClick={save} className="bg-tui-accent hover:brightness-110 active:brightness-90 text-white px-3 py-0.5 rounded-[12px] text-xs font-medium min-w-[72px]">Enregistrer{dirty&&<span className="text-[10px] ml-0.5">*</span>}</button></div>
      </div>
      <div ref={wrapRef} className="flex-1 min-h-0 bg-[#f8f7f4] border-t border-hairline overflow-auto eu-no-drag" onWheel={e=>{if((e.ctrlKey||e.metaKey)&&wrapRef.current){e.preventDefault();const f=e.deltaY<0?1.1:0.9;setZoom(z=>Math.max(0.25,Math.min(4,z*f)));}}}>
        <div style={{position:'relative',width:`${pageSize.w}px`,height:`${pageSize.h}px`}}>
          <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} className="absolute top-0 left-0 touch-none block eu-no-drag" style={{zIndex: 1}} />
          {pendingText && <input ref={textInputRef} autoFocus value={pendingText.value} onChange={e=>setPendingText(p=>p?{...p,value:e.target.value}:null)} onKeyDown={e=>{if(e.key==='Enter')commitPendingText();else if(e.key==='Escape'){cancelPendingText();}}} onBlur={commitPendingText} onFocus={e=>e.target.select()} className="absolute bg-[#ffffff] text-black border-2 border-tui-accent px-1.5 py-0.5 text-sm outline-none shadow-md" style={{left:`${pendingText.normX*pageSize.w}px`,top:`${pendingText.normY*pageSize.h}px`,minWidth:'120px',width:`${Math.max(120, (pendingText.value.length || 8) * 8 + 16)}px`,height:'28px',zIndex:20,fontFamily:'system-ui,sans-serif',boxSizing:'border-box'}}/>}
        </div>
      </div>
    </div>
  );
}
