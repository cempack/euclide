import { afterEach, describe, expect, it, vi } from "vitest";
import { addDropTarget, dropTargetAt } from "./drop";

describe("files dropped on the window", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("go to the pane under the pointer when it takes them", () => {
    const pane = document.createElement("div");
    const inside = pane.appendChild(document.createElement("textarea"));
    const elsewhere = document.createElement("div");
    document.body.append(pane, elsewhere);
    const target = {
      el: pane,
      takes: (paths: string[]) => paths.every((p) => p.endsWith(".png")),
      drop: vi.fn(),
      title: "",
      hint: "",
    };
    const remove = addDropTarget(target);
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    const at = vi.spyOn(document, "elementFromPoint").mockReturnValue(inside);

    // Tauri's physical pixels, halved on a screen at 200 %.
    expect(dropTargetAt({ x: 300, y: 80 }, ["C:\\figure.png"])).toEqual({ target, at: { x: 150, y: 40 } });
    expect(at).toHaveBeenCalledWith(150, 40);
    // A document among the pictures goes to the library.
    expect(dropTargetAt({ x: 300, y: 80 }, ["a.png", "cours.pdf"])).toBeNull();
    // Dropped beside the pane.
    at.mockReturnValue(elsewhere);
    expect(dropTargetAt({ x: 300, y: 80 }, ["a.png"])).toBeNull();
    // A closed note takes nothing.
    at.mockReturnValue(inside);
    remove();
    expect(dropTargetAt({ x: 300, y: 80 }, ["a.png"])).toBeNull();
    expect(dropTargetAt(undefined, ["a.png"])).toBeNull();
  });
});
