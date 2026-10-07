import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Highlight } from "./Highlight";

describe("Highlight", () => {
  it("marks the words the search found, and only them", () => {
    const { container } = render(
      <Highlight text={"la fonction \u0002carrée\u0003 est \u0002paire\u0003…"} />,
    );
    expect([...container.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["carrée", "paire"]);
    expect(container.textContent).toBe("la fonction carrée est paire…");
  });

  it("shows text with an unclosed marker as plain text", () => {
    const { container } = render(<Highlight text={"début \u0002sans fin"} />);
    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("début sans fin");
  });
});
