import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "src-tauri",
      "sidecar",
      ".delta",
      ".claude",
      ".shots",
      "test-results",
      "playwright-report",
      // Stand-ins for third-party packages (see vendor/*/package.json).
      "vendor",
      ".spike",
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
      // Data changes go through changed() (src/api/client.ts), not window events.
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='CustomEvent'][arguments.0.value=/^eu:/]",
          message: "Announce data changes with changed(scope) from src/api/client.ts.",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // React Compiler rules: code that breaks them is not compiled (and
      // usually re-renders more than it should).
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/immutability": "error",
      "react-hooks/refs": "error",
      "react-hooks/purity": "error",
      "react-hooks/preserve-manual-memoization": "error",
    },
  },
  {
    files: ["*.config.{js,ts}", "scripts/**/*.{js,mjs}", "tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
);
