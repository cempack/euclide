import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { q } from "../../api/queries";
import { Modal } from "../../components/ui";
import type { FileItem } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { tr } from "../../lib/i18n";
import { FileKindIcon } from "../../ui/FileKindIcon";
import { Icon } from "../../ui/Icon";
import { fold } from "../classroom/lesson";

/**
 * Another PDF of the library, to add at the end of this one: the course's
 * first, then the rest of the library. A click chooses.
 */
export function PdfChooser({
  open,
  title,
  courseId,
  exclude,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  courseId: number | null;
  /** The document itself. */
  exclude: number;
  onPick: (file: FileItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const course = useQuery({ ...q.files(courseId), enabled: open && courseId != null }).data;
  const library = useQuery({ ...q.files(null), enabled: open }).data;

  const groups = useMemo(() => {
    const want = fold(query.trim());
    const pdfs = (files: FileItem[] | undefined) =>
      (files ?? []).filter((f) => f.kind === "pdf" && f.id !== exclude && fold(f.name).includes(want));
    const list: [string, FileItem[]][] = [
      [tr("pdf.chooseCourse"), courseId != null ? pdfs(course) : []],
      [tr("pdf.chooseLibrary"), pdfs(library)],
    ];
    return list.filter(([, files]) => files.length);
  }, [query, course, library, courseId, exclude]);

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-xl">
      <div className="flex flex-col gap-3">
        <label className="eu-search">
          <Icon icon={Search} size={14} className="text-ink-faint" />
          <input
            data-autofocus
            className="flex-1 min-w-0 bg-transparent outline-hidden"
            placeholder={tr("pdf.chooseSearch")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={tr("pdf.chooseSearch")}
          />
        </label>
        <div className="eu-picker" role="listbox" aria-label={title}>
          {groups.length === 0 ? (
            <p className="eu-t-body text-ink-muted p-4 text-center">{tr("pdf.chooseNone")}</p>
          ) : (
            groups.map(([group, files]) => (
              <div key={group} role="group" aria-label={group}>
                <p className="eu-t-label eu-picker-group">{group}</p>
                {files.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="eu-picker-row"
                    onClick={() => onPick(f)}
                  >
                    <FileKindIcon kind="pdf" className="w-4 h-4 text-ink-muted shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-ink">{f.name}</span>
                      <span className="block eu-t-caption truncate">{relativeTime(f.added_at)}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
