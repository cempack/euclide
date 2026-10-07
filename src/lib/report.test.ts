import { describe, expect, it } from "vitest";
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
