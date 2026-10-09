import { describe, expect, it } from "vitest";
import { emptyTable, markdownTable, parseCells, tableFromClipboard } from "./tables";

const SHEET_HTML = "<html><body><table><tr><td>Nom</td></tr></table></body></html>";

describe("cells copied from a spreadsheet", () => {
  it("read as rows of cells, the last line break and blank rows left out", () => {
    expect(parseCells("Nom\tNote\r\nLéa\t12,5\r\nHugo\t9\r\n\t\r\n")).toEqual([
      ["Nom", "Note"],
      ["Léa", "12,5"],
      ["Hugo", "9"],
    ]);
  });

  it("keep a quoted cell's tabs, line breaks and doubled quotes", () => {
    expect(parseCells('"Dit ""bonjour""\tpuis\npart"\tB\nC\t\n')).toEqual([
      ['Dit "bonjour"\tpuis\npart', "B"],
      ["C", ""],
    ]);
  });

  it("make a table, its columns of numbers set to the right", () => {
    expect(
      markdownTable([
        ["Élève", "Note", "Rang"],
        ["Léa", "12,5", "2"],
        ["Hugo | Jean", "1 234", ""],
        ["Zoé\nB.", "15 %"],
      ]),
    ).toBe(
      [
        "| Élève | Note | Rang |",
        "| --- | ---: | ---: |",
        "| Léa | 12,5 | 2 |",
        "| Hugo \\| Jean | 1 234 | |",
        "| Zoé B. | 15 % | |",
      ].join("\n"),
    );
  });

  it("come from the clipboard only when it holds a spreadsheet's table", () => {
    expect(tableFromClipboard("x\ty\n1\t2\n", SHEET_HTML)).toBe("| x | y |\n| ---: | ---: |\n| 1 | 2 |");
    // A Python script indented with tabs.
    expect(tableFromClipboard("def f():\n\treturn 1\n", "")).toBeNull();
    // A single cell is its value.
    expect(tableFromClipboard("12\n", SHEET_HTML)).toBeNull();
    expect(tableFromClipboard("seul", SHEET_HTML)).toBeNull();
  });

  it("start empty under a header", () => {
    expect(emptyTable(["A", "B"], 1)).toBe("| A | B |\n| --- | --- |\n| | |");
  });
});
