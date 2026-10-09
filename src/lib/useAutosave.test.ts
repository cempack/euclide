import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutosave } from "./useAutosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(initial: { dirty: boolean; change: unknown; visible: boolean }) {
  const save = vi.fn(async () => {});
  const hook = renderHook((props: typeof initial) => useAutosave({ ...props, save, delay: 4000 }), {
    initialProps: initial,
  });
  return { save, rerender: hook.rerender };
}

describe("useAutosave", () => {
  it("saves once the teacher pauses, not while drawing", () => {
    const { save, rerender } = setup({ dirty: true, change: 1, visible: true });
    vi.advanceTimersByTime(3000);
    rerender({ dirty: true, change: 2, visible: true });
    vi.advanceTimersByTime(3000);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledOnce();
  });

  it("does nothing when nothing changed", () => {
    const { save, rerender } = setup({ dirty: false, change: 1, visible: true });
    vi.advanceTimersByTime(10_000);
    rerender({ dirty: false, change: 1, visible: false });
    window.dispatchEvent(new Event("blur"));
    expect(save).not.toHaveBeenCalled();
  });

  it("saves at once when the tab is left or the window loses focus", () => {
    const { save, rerender } = setup({ dirty: true, change: 1, visible: true });
    rerender({ dirty: true, change: 1, visible: false });
    expect(save).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("blur"));
    expect(save).toHaveBeenCalledTimes(2);
  });
});
