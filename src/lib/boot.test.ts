import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOT = {
  nonce: "launch-1",
  settings: { theme: "dark", density: null },
  pronote: { connected: true, account_name: "M. Martin", last_sync: null },
};

describe("boot state", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    window.__EUCLIDE_BOOT__ = structuredClone(BOOT);
  });

  it("gives saved settings, null when never saved, undefined when unknown", async () => {
    const boot = await import("./boot");
    expect(boot.bootSetting("theme")).toBe("dark");
    expect(boot.bootSetting("density")).toBeNull();
    expect(boot.bootSetting("pronote_password")).toBeUndefined();
  });

  it("is ignored after a reload of the page", async () => {
    await import("./boot");
    vi.resetModules();
    const reloaded = await import("./boot");
    expect(reloaded.bootSetting("theme")).toBeUndefined();
  });

  it("hands the Pronote status out once and forgets settings on demand", async () => {
    const boot = await import("./boot");
    expect(boot.takeBootPronote()?.account_name).toBe("M. Martin");
    expect(boot.takeBootPronote()).toBeUndefined();
    boot.forgetBootSetting("theme");
    expect(boot.bootSetting("theme")).toBeUndefined();
  });
});
