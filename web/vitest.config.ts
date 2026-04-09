import path from "node:path";
import { createRequire } from "node:module";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const reactEntry = require.resolve("react", { paths: [__dirname] });
const reactJsxRuntimeEntry = require.resolve("react/jsx-runtime", { paths: [__dirname] });
const reactJsxDevRuntimeEntry = require.resolve("react/jsx-dev-runtime", { paths: [__dirname] });
const reactDomEntry = require.resolve("react-dom", { paths: [__dirname] });
const reactDomClientEntry = require.resolve("react-dom/client", { paths: [__dirname] });

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "react/jsx-dev-runtime", replacement: reactJsxDevRuntimeEntry },
      { find: "react/jsx-runtime", replacement: reactJsxRuntimeEntry },
      { find: "react-dom/client", replacement: reactDomClientEntry },
      { find: "react-dom/test-utils", replacement: path.resolve(__dirname, "../node_modules/react-dom/test-utils.js") },
      { find: "react-dom", replacement: reactDomEntry },
      { find: "react", replacement: reactEntry },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    server: {
      deps: {
        inline: [
          "@emotion/react",
          "@emotion/styled",
          "@mui/material",
          "@mui/system",
          "@testing-library/react",
        ],
      },
    },
  },
});
