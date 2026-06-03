import { useState } from "react";

import { api, openWith, type Opener } from "../lib/api";
import { FolderIcon, GlobeIcon, FileIcon } from "./icons";

export function OpenWithButton({
  fileId,
  className = "new-btn-ghost",
  label = "Ouvrir dehors",
}: {
  fileId: number;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Opener[] | null>(null);

  const load = async () => {
    if (options) return options;
    try {
      const list = await api.listOpeners(fileId);
      setOptions(list);
      return list;
    } catch {
      // fallback minimal
      const fb: Opener[] = [
        { name: "Navigateur par défaut", app: undefined, is_reveal: false },
        { name: "Application par défaut", app: undefined, is_reveal: false },
        { name: "Afficher dans le dossier", app: undefined, is_reveal: true },
      ];
      setOptions(fb);
      return fb;
    }
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await load();
    setOpen(!open);
  };

  const handle = async (opt: Opener) => {
    setOpen(false);
    try {
      await openWith(fileId, opt);
    } catch {
      // silent
    }
  };

  const getIcon = (opt: Opener) => {
    const iconClass = "w-3.5 h-3.5 shrink-0";
    if (opt.is_reveal) return <FolderIcon className={iconClass} />;
    const nameLower = opt.name.toLowerCase();
    if (nameLower.includes("navigateur") || nameLower.includes("browser")) {
      return <GlobeIcon className={iconClass} />;
    }
    if (!opt.app || nameLower.includes("application") || nameLower.includes("défaut")) {
      return <FileIcon className={iconClass} />;
    }
    return <FileIcon className={iconClass} />;
  };

  return (
    <div className="relative inline-block" onBlur={() => setTimeout(() => setOpen(false), 150)}>
      <button
        onClick={handleClick}
        className={className}
        title="Ouvrir dehors"
      >
        {label}
      </button>
      {open && options && (
        <div
          className="absolute right-0 mt-1 z-[100] min-w-[220px] new-card p-1 text-sm bg-surface border border-hairline shadow-card"
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => handle(opt)}
              className="flex w-full items-center text-left px-3 py-1.5 rounded hover:bg-surface-soft text-primary active:bg-surface-container"
            >
              <span className="mr-2 text-base">{getIcon(opt)}</span>
              <span>{opt.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
