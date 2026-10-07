import { useRef, useState } from "react";
import { PdfView, type PdfTool, type PdfViewHandle } from "../features/pdf/PdfView";
import sample from "./fixtures/cours.pdf?url";

/** Development page (?pdf): the PDF view on a sample document. */
export default function PdfSpike() {
  const ref = useRef<PdfViewHandle>(null);
  const [tool, setTool] = useState<PdfTool>("select");
  const [info, setInfo] = useState("…");
  const [saved, setSaved] = useState(0);
  const url = new URLSearchParams(location.search).get("pdf") || sample;
  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-2 p-2 border-b border-line items-center" data-testid="bar">
        {(["select", "pen", "highlight", "text"] as PdfTool[]).map((t) => (
          <button
            key={t}
            className="eu-btn-ghost eu-btn-sm"
            aria-pressed={tool === t}
            onClick={() => setTool(t)}
          >
            {t}
          </button>
        ))}
        <button className="eu-btn-ghost eu-btn-sm" onClick={() => ref.current?.zoom(1)}>
          +
        </button>
        <button
          className="eu-btn-primary eu-btn-sm"
          onClick={async () => setSaved((await ref.current!.save()).byteLength)}
        >
          save
        </button>
        <span data-testid="info">{info}</span>
        <span data-testid="saved">{saved}</span>
      </div>
      <div className="flex-1 relative">
        <PdfView
          ref={ref}
          source={{ url }}
          tool={tool}
          color="#a4262c"
          onReady={(n) => setInfo(`pages=${n}`)}
          onPage={(p) => setInfo((s) => `${s.split(" ")[0]} page=${p}`)}
          onError={(e) => setInfo(`error ${String(e)}`)}
        />
      </div>
    </div>
  );
}
