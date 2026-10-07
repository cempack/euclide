import { createPortal } from "react-dom";
import { tr } from "../../lib/i18n";
import { Markdown } from "./Markdown";

export interface PrintJob {
  title: string;
  body: string;
  /** The course and its classes (« Mathématiques · 2NDE 7 »), or empty. */
  context: string;
  date: string;
  /** Boxes for the student's name, first name, class and mark. */
  nameBox: boolean;
}

/** A note that starts with its own `# Titre` does not get a second one. */
const hasOwnTitle = (body: string) => /^\s*#\s/.test(body);

/**
 * The note as it prints: paper colours in any theme, A4 margins, a header
 * line, and for an assessment the boxes students fill in. Laid out off
 * screen (so fonts and formulas are ready), alone on the page when printing
 * (`.eu-print` in styles.css).
 */
export function PrintSheet({ job }: { job: PrintJob }) {
  return createPortal(
    <div className="eu-print" data-theme="light" aria-hidden>
      <header className="eu-print-head">
        <span>{job.context}</span>
        <span>{job.date}</span>
      </header>
      {job.nameBox && (
        <div className="eu-print-namebox">
          <span>{tr("print.name")}</span>
          <span>{tr("print.firstName")}</span>
          <span>{tr("print.class")}</span>
          <span className="eu-print-mark">
            {tr("print.mark")}
            <b>/ 20</b>
          </span>
        </div>
      )}
      {!hasOwnTitle(job.body) && <h1 className="eu-print-title">{job.title}</h1>}
      <Markdown body={job.body} />
    </div>,
    document.body,
  );
}

/** Resolves once the sheet's fonts and pictures are loaded. */
export async function sheetReady(): Promise<void> {
  await document.fonts.ready;
  const images = Array.from(document.querySelectorAll<HTMLImageElement>(".eu-print img"));
  await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
  // One more turn so the last layout settles.
  await new Promise((resolve) => window.setTimeout(resolve, 30));
}

/**
 * The system print dialog. Resolves when it is closed: some webviews return
 * from `print()` at once and print later, so the sheet stays until
 * `afterprint` (or a minute, if it never comes).
 */
export function printDialog(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("afterprint", finish);
      window.clearTimeout(timer);
      resolve();
    };
    window.addEventListener("afterprint", finish);
    const timer = window.setTimeout(finish, 60_000);
    window.print();
  });
}
