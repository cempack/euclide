import { describe, expect, it } from "vitest";
import { portableAssetOf } from "./updater";

const zip = "https://github.com/cempack/euclide/releases/download/v0.4.2/Euclide-windows-portable.zip";

describe("portableAssetOf", () => {
  it("finds the signed USB archive", () => {
    const manifest = {
      version: "0.4.2",
      platforms: {
        "windows-x86_64": { url: zip, signature: "c2ln" },
        "windows-x86_64-nsis": {
          url: "https://api.github.com/repos/x/y/releases/assets/1",
          signature: "bnNpcw==",
        },
      },
    };
    expect(portableAssetOf(manifest)).toEqual({ url: zip, signature: "c2ln" });
  });

  it("ignores a manifest that offers the installer to USB copies", () => {
    // What latest.json held for a few minutes while a release was still building.
    const installer = {
      platforms: {
        "windows-x86_64": {
          url: "https://github.com/cempack/euclide/releases/download/v0.4.2/Euclide_0.4.2_x64-setup.exe",
          signature: "c2ln",
        },
      },
    };
    expect(portableAssetOf(installer)).toBeNull();
  });

  it("wants https and a signature", () => {
    expect(
      portableAssetOf({
        platforms: { "windows-x86_64": { url: zip.replace("https", "http"), signature: "s" } },
      }),
    ).toBeNull();
    expect(portableAssetOf({ platforms: { "windows-x86_64": { url: zip, signature: "" } } })).toBeNull();
    expect(
      portableAssetOf({ platforms: { "windows-x86_64": { url: "not a url", signature: "s" } } }),
    ).toBeNull();
  });

  it("survives odd manifests", () => {
    expect(portableAssetOf(null)).toBeNull();
    expect(portableAssetOf({})).toBeNull();
    expect(portableAssetOf({ platforms: { "windows-x86_64": { url: 3, signature: true } } })).toBeNull();
  });
});
