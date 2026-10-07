import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "public/pdfjs",
      "src-tauri",
      "sidecar",
      ".delta",
      ".claude",
      ".shots",
      "test-results",
      "playwright-report",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  prettier,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // Empty catches hide failures from the teacher; make each one visible.
      "no-empty": ["warn", { allowEmptyCatch: false }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // React Compiler rules: warnings until the state refactor, then errors.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  {
    files: ["*.config.{js,ts}", "scripts/**/*.{js,mjs}", "tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
);
