import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeError } from "./report";

describe("describeError", () => {
  it("keeps the name, the message and the first stack frame", () => {
    const err = new TypeError("x is undefined");
    err.stack = "TypeError: x is undefined\n    at load (app.js:1:2)\n    at run (app.js:3:4)";
    expect(describeError(err)).toBe("TypeError: x is undefined (at load (app.js:1:2))");
  });

  it("serializes backend errors", () => {
    expect(describeError({ code: "not_found", message: "Introuvable" })).toBe(
      '{"code":"not_found","message":"Introuvable"}',
    );
  });

  it("copes with values JSON cannot represent", () => {
    expect(describeError(undefined)).toBe("undefined");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(describeError(cyclic)).toBe("[object Object]");
  });
});

describe("reportError and logged", () => {
  const logErrors = vi.fn((_lines: string[]) => Promise.resolve());

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    logErrors.mockClear();
    vi.doMock("./api", () => ({ api: { logErrors }, isTauri: () => true }));
  });

  afterEach(() => {
    vi.doUnmock("./api");
    vi.useRealTimers();
  });

  it("logs a caught error with where it was caught", async () => {
    const { reportError } = await import("./report");
    reportError("settings.theme", { code: "io", message: "Disque plein" });
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(logErrors).toHaveBeenCalledOnce());
    expect(logErrors.mock.calls[0][0]).toEqual([
      'caught settings.theme: {"code":"io","message":"Disque plein"}',
    ]);
  });

  it("gives a rejection handler that logs", async () => {
    const { logged } = await import("./report");
    const err = new Error("introuvable");
    err.stack = "Error: introuvable";
    await Promise.reject(err).catch(logged("pdf.versions"));
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(logErrors).toHaveBeenCalledOnce());
    expect(logErrors.mock.calls[0][0]).toEqual(["caught pdf.versions: Error: introuvable"]);
  });
});
