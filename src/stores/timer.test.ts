import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTimer, onTimerDone, timer } from "./timer";
import { act, renderHook } from "@testing-library/react";
import { useTimerRunning, useTimerSec } from "./timer";

describe("class timer", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-06T10:00:00") }));
  afterEach(() => {
    timer.stop();
    vi.useRealTimers();
  });

  it("follows the clock even when the window throttles its timers", () => {
    const { result } = renderHook(() => useTimerSec());
    act(() => timer.start(10));
    expect(result.current).toBe(600);
    // Hidden window: three minutes pass, intervals do not fire.
    vi.setSystemTime(Date.now() + 180_000);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current).toBe(420);
  });

  it("pauses, resumes and adds time", () => {
    const sec = renderHook(() => useTimerSec());
    const running = renderHook(() => useTimerRunning());
    act(() => timer.start(1));
    act(() => void vi.advanceTimersByTime(20_000));
    act(() => timer.toggle());
    expect(running.result.current).toBe(false);
    expect(sec.result.current).toBe(40);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(sec.result.current).toBe(40);
    act(() => timer.add(1));
    expect(sec.result.current).toBe(100);
    expect(running.result.current).toBe(true);
  });

  it("rings once at zero and stays at 00:00 until put away", () => {
    const done = vi.fn();
    const off = onTimerDone(done);
    const sec = renderHook(() => useTimerSec());
    act(() => timer.start(0.5));
    act(() => void vi.advanceTimersByTime(31_000));
    expect(done).toHaveBeenCalledTimes(1);
    expect(sec.result.current).toBe(0);
    act(() => timer.toggle());
    expect(sec.result.current).toBe(null);
    off();
  });

  it("formats minutes and seconds", () => {
    expect(formatTimer(605)).toBe("10:05");
    expect(formatTimer(-3)).toBe("00:00");
  });
});
