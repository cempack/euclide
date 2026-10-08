import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { SCREENS, VARIANTS, boot } from "./app";

/**
 * Every screen, light and dark, checked by axe against WCAG 2.1 A and AA:
 * names for controls, roles, contrast. Run with the screenshots.
 */
for (const v of VARIANTS.filter((x) => x.density === "comfortable")) {
  test.describe(`a11y ${v.theme}`, () => {
    for (const s of SCREENS) {
      test(s.name, async ({ page }) => {
        await boot(page, v);
        await s.go(page);
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const found = result.violations.map((x) => ({
          rule: x.id,
          impact: x.impact,
          nodes: x.nodes
            .slice(0, 4)
            .map((n) => `${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1] ?? ""}`),
        }));
        expect(found, JSON.stringify(found, null, 2)).toEqual([]);
      });
    }
  });
}
