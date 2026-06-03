const expo = require("eslint-config-expo/flat");

module.exports = [
  ...expo,
  {
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // Real bugs — keep as errors
      "react-hooks/rules-of-hooks": "error",

      // Real potential bugs — warn, fix incrementally
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "import/no-duplicates": "error",

      // React Compiler compatibility rules — warn, not errors
      // These enforce patterns needed for the React Compiler optimizer.
      // Not errors in a non-Compiler codebase but good to track.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
    },
  },
  {
    ignores: ["node_modules/**", ".expo/**", "dist/**", "android/**", "ios/**"],
  },
];
