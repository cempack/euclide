import { useCallback } from "react";
import { useToast } from "../components/ui";
import { api, type FileItem } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { fmt, get } from "../lib/i18n";
import { logged, reportError } from "../lib/report";

/**
 * Adding files to the library, from the picker or dropped on the window.
 * Closing the picker without choosing is not a failure: it says nothing.
 */
export function useImportFiles() {
  const toast = useToast();

  const run = useCallback(
    async (where: string, load: () => Promise<FileItem[] | null>) => {
      try {
        const added = (await load()) ?? [];
        if (!added.length) return;
        for (const f of added) api.logEvent("file_import", f.name, f.course_id).catch(logged("import.log"));
        window.dispatchEvent(new CustomEvent("eu:library-changed"));
        toast(fmt(get("documents.toastImported", "{count} importé(s)"), { count: added.length }), "success");
      } catch (err) {
        reportError(where, err);
        toast(errorMessage(err, get("messages.importError", "Import impossible")), "error");
      }
    },
    [toast],
  );

  const pick = useCallback(
    (courseId: number | null = null) => run("import.pick", () => api.importFiles(courseId)),
    [run],
  );
  const drop = useCallback(
    (paths: string[], courseId: number | null = null) => {
      toast(get("messages.importing", "Import…"), "info");
      return run("import.drop", () => api.importPaths(paths, courseId));
    },
    [run, toast],
  );
  return { pick, drop };
}
