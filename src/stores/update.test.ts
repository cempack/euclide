import { describe, expect, it } from "vitest";
import { runInstall, type InstallSteps } from "./update";

type Patch = Parameters<Parameters<typeof runInstall>[1]>[0];

/** Steps that record their order; `over` changes what one of them does. */
function steps(over: Partial<InstallSteps> = {}, ready: boolean[] = [true, true]) {
  const calls: string[] = [];
  const answers = [...ready];
  const base: InstallSteps = {
    confirm: async () => (calls.push("confirm"), true),
    readyToQuit: async () => (calls.push("readyToQuit"), answers.shift() ?? true),
    download: async (onPercent) => {
      calls.push("download");
      onPercent(50);
      return { installed: false };
    },
    saveSession: async () => void calls.push("saveSession"),
    install: async () => void calls.push("install"),
    relaunch: async () => void calls.push("relaunch"),
  };
  const wrapped = Object.fromEntries(
    Object.entries(over).map(([name, fn]) => [
      name,
      async (...args: unknown[]) => {
        calls.push(name);
        return (fn as (...a: unknown[]) => unknown)(...args);
      },
    ]),
  );
  return { steps: { ...base, ...wrapped } as InstallSteps, calls };
}

async function run(s: InstallSteps) {
  const patches: Patch[] = [];
  await runInstall(s, (p) => patches.push(p));
  return { patches, last: Object.assign({}, ...patches) as Patch };
}

describe("runInstall", () => {
  it("saves before installing, and restarts last", async () => {
    const { steps: s, calls } = steps();
    const { last, patches } = await run(s);
    expect(calls).toEqual([
      "confirm",
      "readyToQuit",
      "download",
      "readyToQuit",
      "saveSession",
      "install",
      "relaunch",
    ]);
    expect(patches).toContainEqual({ percent: 50 });
    expect(last.phase).toBe("restarting");
  });

  it("does nothing more when the teacher cancels", async () => {
    const declined = steps({ confirm: async () => false });
    await run(declined.steps);
    expect(declined.calls).toEqual(["confirm"]);

    const unsaved = steps({}, [false]);
    const { patches } = await run(unsaved.steps);
    expect(unsaved.calls).toEqual(["confirm", "readyToQuit"]);
    expect(patches).toEqual([]);
  });

  it("asks again about what changed during the download, without restarting", async () => {
    const { steps: s, calls } = steps({}, [true, false]);
    const { last } = await run(s);
    expect(calls).toEqual(["confirm", "readyToQuit", "download", "readyToQuit"]);
    expect(last.phase).toBe("available");

    // A USB copy has it in place already: the next opening runs it.
    const usb = steps({ download: async () => ({ installed: true }) }, [true, false]);
    expect((await run(usb.steps)).last.phase).toBe("installed");
  });

  it("never restarts after a failure", async () => {
    const download = steps({
      download: async () => {
        throw new Error("réseau coupé");
      },
    });
    const failed = await run(download.steps);
    expect(failed.last).toMatchObject({ phase: "error", error: "réseau coupé" });
    expect(download.calls).not.toContain("relaunch");

    const install = steps({
      install: async () => {
        throw new Error("installateur refusé");
      },
    });
    expect((await run(install.steps)).last.phase).toBe("error");
    expect(install.calls).not.toContain("relaunch");
  });

  it("a USB copy installs while downloading, and a failed restart leaves it for the next opening", async () => {
    const { steps: s, calls } = steps({
      download: async () => ({ installed: true }),
      relaunch: async () => {
        throw new Error("euclide.exe introuvable");
      },
    });
    const { last } = await run(s);
    expect(calls).not.toContain("install");
    expect(last.phase).toBe("installed");
  });
});
