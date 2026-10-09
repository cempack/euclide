import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import NoteEditor from "./NoteEditor";
import { ConfirmProvider, ToastProvider } from "./ui";
import { editors } from "../stores/editors";
import { tabs, useTabsStore } from "../stores/tabs";
import { tr } from "../lib/i18n";

type Saved = { title: string; body: string };

let saved: Saved[] = [];

beforeEach(() => {
  saved = [];
  useTabsStore.setState({
    tabs: [
      { id: "dashboard", kind: "dashboard", title: "Tableau de bord", params: {}, mountId: "dashboard" },
    ],
    activeId: "dashboard",
    maxTabsMode: "unlimited",
    maxTabsFixed: 12,
    tabFitCapacity: 0,
  });
  mockIPC((cmd, args) => {
    if (cmd === "list_courses") return [];
    if (cmd === "save_note") {
      const note = (args as { note: Saved }).note;
      saved.push({ title: note.title, body: note.body });
      return { course_id: null, ...note, id: 42, updated_at: "2026-10-09 10:00:00" };
    }
    return null;
  });
});

afterEach(() => {
  cleanup();
  clearMocks();
});

function open() {
  const id = tabs.open({ kind: "note", params: { isNew: true } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <NoteEditor tabId={id} isNew />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return id;
}

describe("NoteEditor", () => {
  it("names a note whose title was cleared instead of dropping its text", async () => {
    const id = open();
    const title = await screen.findByLabelText(tr("notes.titlePlaceholder"));
    fireEvent.change(title, { target: { value: "" } });
    fireEvent.change(document.querySelector("textarea")!, { target: { value: "Le théorème de Pythagore" } });
    await waitFor(() => expect(editors.isDirty(id)).toBe(true));

    // Autosave waits for a title…
    await act(() => new Promise((r) => setTimeout(r, 1000)));
    expect(saved).toEqual([]);

    // …closing the tab or Ctrl+S does not.
    await act(() => editors.flush(id));
    expect(saved).toEqual([{ title: "Nouvelle note", body: "Le théorème de Pythagore" }]);
    expect((title as HTMLInputElement).value).toBe("Nouvelle note");
    expect(tabs.list().some((t) => t.id === "note:42")).toBe(true);
    editors.forget("note:42");
  });
});
