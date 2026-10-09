import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaneBoundary } from "./PaneBoundary";
import { tr } from "../lib/i18n";

const reported = vi.hoisted(() => [] as string[]);
vi.mock("../lib/report", async (actual) => ({
  ...(await actual<typeof import("../lib/report")>()),
  reportLine: (line: string) => reported.push(line),
}));

let broken = true;
function Fragile() {
  if (broken) throw new Error("la note a cassé");
  return <p>la note</p>;
}

beforeEach(() => {
  broken = true;
  reported.length = 0;
  // React prints what a boundary caught.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PaneBoundary", () => {
  it("keeps a crash inside its tab and logs it", () => {
    render(
      <>
        <PaneBoundary where="note" onClose={() => {}}>
          <Fragile />
        </PaneBoundary>
        <PaneBoundary where="documents" onClose={() => {}}>
          <p>les documents</p>
        </PaneBoundary>
      </>,
    );
    expect(screen.getByText("les documents")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(tr("app.paneError"));
    expect(reported.some((l) => l.startsWith("render note") && l.includes("la note a cassé"))).toBe(true);
  });

  it("tries again, or closes the tab", () => {
    const onClose = vi.fn();
    render(
      <PaneBoundary where="note" onClose={onClose}>
        <Fragile />
      </PaneBoundary>,
    );
    fireEvent.click(screen.getByText(tr("app.paneClose")));
    expect(onClose).toHaveBeenCalledOnce();
    broken = false;
    fireEvent.click(screen.getByText(tr("app.paneRetry")));
    expect(screen.getByText("la note")).toBeTruthy();
  });

  it("clears an overlay's error when it opens again", () => {
    const { rerender } = render(
      <PaneBoundary where="scene" overlay onClose={() => {}} resetKey={1}>
        <Fragile />
      </PaneBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain(tr("app.overlayError"));
    broken = false;
    rerender(
      <PaneBoundary where="scene" overlay onClose={() => {}} resetKey={2}>
        <Fragile />
      </PaneBoundary>,
    );
    expect(screen.getByText("la note")).toBeTruthy();
  });
});
