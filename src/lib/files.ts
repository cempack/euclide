import { tabs } from "../stores/tabs";
import { api } from "./api";
import { logged } from "./report";

/** What it takes to open a library file: the shape of files, steps and search hits. */
export type OpenableFile = { id: number; name: string; kind: string; courseId?: number | null };

/**
 * Opens a file where Euclide shows it: boards in the whiteboard, PDFs and
 * images in the viewer, anything else in the PC's own application.
 */
export function openFile(f: OpenableFile, event = "file_open") {
  api.logEvent(event, f.name, f.courseId ?? null).catch(logged("files.logOpen"));
  if (f.kind === "board") tabs.open({ kind: "whiteboard", title: f.name, params: { fileId: f.id } });
  else if (f.kind === "pdf" || f.kind === "image")
    tabs.open({ kind: "pdf", title: f.name, params: { fileId: f.id, fileName: f.name } });
  else api.openFile(f.id).catch(logged("files.openExternal"));
}
