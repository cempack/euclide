import { test, expect } from "@playwright/test";
import { nav, settle } from "./app";

/**
 * A class's students, for the draw and the groups: every class at once from
 * Pronote (Outils), or one class from its page, which Cours leads to.
 */

test("Outils loads every class's students from Pronote in one go", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await nav(page, "Outils");
  const classes = page.getByRole("combobox", { name: /classe/i });
  // The sample data has two lists, typed or pasted by hand.
  await expect(classes.locator("option")).toHaveCount(2);

  await page.getByRole("button", { name: "Mettre à jour les listes depuis Pronote" }).click();
  await expect(page.getByText(/^Élèves chargés depuis Pronote\s:\s2NDE4 \(24\), 2NDE7 \(24\)/)).toBeVisible();
  // Each of the teacher's classes has its list now, ready to draw from.
  await expect(classes.locator("option")).toHaveCount(6);
  await expect(classes.locator("option").first()).toHaveText(/1SPE3 · 24 élèves/);
});

test("Cours leads to a class's students, under each class", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await nav(page, "Cours");
  await page.getByText("Mathématiques", { exact: true }).first().click();
  await settle(page);
  await page.getByRole("tab", { name: /^Classes/ }).click();
  await page.getByRole("button", { name: "Élèves et cahier de textes" }).first().click();
  await settle(page);
  await expect(page.getByRole("heading", { level: 1, name: /^Élèves et cahier de textes — / })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Élèves", exact: true })).toBeVisible();
});
