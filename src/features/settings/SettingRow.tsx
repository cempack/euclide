import { useEffect, useState, type ReactNode } from "react";
import { tr } from "../../lib/i18n";

/** One setting: what it is on the left, its control on the right. */
export function SettingRow({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="eu-setting">
      <div className="min-w-0 flex-1">
        <p className="eu-t-body font-medium text-ink">{title}</p>
        {hint && <div className="eu-t-meta max-w-[62ch]">{hint}</div>}
      </div>
      {children && <div className="eu-setting-control">{children}</div>}
    </div>
  );
}

export interface NavSection {
  id: string;
  label: string;
}

/**
 * The page's sections, always in view: a click scrolls to one, and the one
 * being read is marked as the page scrolls.
 */
export function SettingsNav({ sections }: { sections: NavSection[] }) {
  const [current, setCurrent] = useState(sections[0]?.id);

  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = sections.find((s) => seen.get(s.id));
        if (first) setCurrent(first.id);
      },
      // A section counts once its top passes the upper fifth of the page.
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  const go = (id: string) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setCurrent(id);
  };

  return (
    <nav className="eu-settings-nav" aria-label={tr("settings.sections")}>
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className="eu-filter"
          aria-current={current === s.id ? "true" : undefined}
          onClick={() => go(s.id)}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}
