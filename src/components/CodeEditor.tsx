import { useRef } from "react";

export default function CodeEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const lines = Math.max(value.split("\n").length, 1);

  const onScroll = () => {
    if (gutterRef.current && taRef.current) {
      gutterRef.current.scrollTop = taRef.current.scrollTop;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = value.slice(0, start) + "    " + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 4;
      });
    }
  };

  return (
    <div className="flex rounded-lg border border-hairline bg-surface overflow-hidden font-mono text-[12.5px] leading-[1.55]">
      <div
        ref={gutterRef}
        className="select-none overflow-hidden py-3 pl-3 pr-2 text-right text-body-mute/70 opacity-50 bg-surface"
        style={{ minWidth: 42 }}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        wrap="off"
        className="flex-1 resize-none bg-transparent py-3 px-3 outline-none text-on-surface placeholder:text-body-mute placeholder:opacity-50 selectable min-h-[320px]"
      />
    </div>
  );
}
