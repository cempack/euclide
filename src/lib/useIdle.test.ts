import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIdle } from "./useIdle";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useIdle", () => {
  it("hides once the pointer rests, not while it moves", () => {
    const { result } = renderHook(() => useIdle(2000));
    expect(result.current.idle).toBe(false);
    act(() => vi.advanceTimersByTime(1500));
    act(() => result.current.wake());
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.idle).toBe(false);
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.idle).toBe(true);
  });

  it("comes back on a move", () => {
    const { result } = renderHook(() => useIdle(2000));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.idle).toBe(true);
    act(() => result.current.wake());
    expect(result.current.idle).toBe(false);
  });

  it("stays while the pointer is over the controls", () => {
    const { result } = renderHook(() => useIdle(2000));
    act(() => result.current.hold(true));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.idle).toBe(false);
    act(() => result.current.hold(false));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.idle).toBe(true);
  });
});
