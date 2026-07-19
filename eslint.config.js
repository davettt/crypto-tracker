import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      security,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...security.configs.recommended.rules,
      "security/detect-object-injection": "off",
    },
  },
  {
    extends: [js.configs.recommended],
    files: ["server/**/*.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
      },
    },
    plugins: {
      security,
    },
    rules: {
      ...security.configs.recommended.rules,
      "security/detect-object-injection": "off",
      "security/detect-non-literal-fs-filename": "off",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
