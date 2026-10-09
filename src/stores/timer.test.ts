import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTimer, onTimerDone, timer } from "./timer";
import { act, renderHook } from "@testing-library/react";
import { stopwatch, useStopwatchElapsed, useStopwatchLaps, useTimerRunning, useTimerSec } from "./timer";

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

describe("stopwatch", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-06T10:00:00") }));
  afterEach(() => {
    stopwatch.stop();
    vi.useRealTimers();
  });

  it("counts up by the clock, pauses, resumes and notes laps", () => {
    const elapsed = renderHook(() => useStopwatchElapsed());
    const laps = renderHook(() => useStopwatchLaps());
    act(() => stopwatch.start());
    expect(elapsed.result.current).toBe(0);
    act(() => void vi.advanceTimersByTime(65_000));
    expect(elapsed.result.current).toBe(65);
    act(() => stopwatch.lap());
    // A hidden window: intervals do not fire, the clock goes on.
    vi.setSystemTime(Date.now() + 30_000);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(elapsed.result.current).toBe(95);
    act(() => stopwatch.toggle());
    act(() => void vi.advanceTimersByTime(60_000));
    expect(elapsed.result.current).toBe(95);
    act(() => stopwatch.toggle());
    act(() => void vi.advanceTimersByTime(5_000));
    expect(elapsed.result.current).toBe(100);
    act(() => stopwatch.lap());
    expect(laps.result.current).toEqual([65, 100]);
    act(() => stopwatch.stop());
    expect(elapsed.result.current).toBeNull();
    expect(laps.result.current).toEqual([]);
  });

  it("runs beside the timer", () => {
    const sec = renderHook(() => useTimerSec());
    const elapsed = renderHook(() => useStopwatchElapsed());
    act(() => {
      timer.start(1);
      stopwatch.toggle();
    });
    act(() => void vi.advanceTimersByTime(10_000));
    expect(sec.result.current).toBe(50);
    expect(elapsed.result.current).toBe(10);
    timer.stop();
  });
});
