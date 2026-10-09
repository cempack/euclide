import { useId, useRef, useState } from "react";
import { ExternalLink, File, Folder, Globe, type LucideIcon } from "lucide-react";

import { api, openWith, type Opener } from "../lib/api";
import { tr } from "../lib/i18n";
import { reportError } from "../lib/report";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";
import { tip } from "../ui/Tooltip";

/** The opener's glyph: its folder, the browser, or an application. */
function iconFor(opt: Opener): LucideIcon {
  if (opt.is_reveal) return Folder;
  return /navigateur|browser/i.test(opt.name) ? Globe : File;
}

/**
 * « Ouvrir dehors »: the file in another application of the PC, or its
 * folder in the explorer, from the app's own menu. `labelClassName` hides
 * the words where room is short (a toolbar), the icon and tooltip stay.
 */
export function OpenWithButton({
  fileId,
  className = "eu-btn-ghost",
  labelClassName = "",
}: {
  fileId: number;
  className?: string;
  labelClassName?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [options, setOptions] = useState<Opener[] | null>(null);
  // A press on the button first light-dismisses the open menu; the click
  // that follows must not open it again.
  const closedAt = useRef(0);
  const id = useId();

  // The PC's applications, asked for once, when the menu first opens.
  const load = async () => {
    if (options) return;
    try {
      setOptions(await api.listOpeners(fileId));
    } catch (err) {
      reportError("openWith.list", err);
      setOptions([
        { name: tr("openWith.browser"), app: undefined, is_reveal: false },
        { name: tr("openWith.defaultApp"), app: undefined, is_reveal: false },
        { name: tr("openWith.reveal"), app: undefined, is_reveal: true },
      ]);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={tr("openWith.label")}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        aria-controls={id}
        {...tip(tr("openWith.title"))}
        onClick={(e) => {
          if (anchor || performance.now() - closedAt.current < 300) return;
          const button = e.currentTarget;
          void load().then(() => setAnchor(button));
        }}
      >
        <Icon icon={ExternalLink} size={14} />
        <span className={labelClassName}>{tr("openWith.label")}</span>
      </button>
      <Menu
        id={id}
        open={!!anchor && !!options}
        anchor={anchor}
        label={tr("openWith.label")}
        placement="bottom-end"
        items={(options ?? []).map((opt) => ({
          label: opt.name,
          icon: iconFor(opt),
          onSelect: () => void openWith(fileId, opt).catch((err) => reportError("openWith.open", err)),
        }))}
        onClose={() => {
          closedAt.current = performance.now();
          setAnchor(null);
        }}
      />
    </>
  );
}
