import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  define: {
    __DEV__: false,
  },
  resolve: {
    alias: {
      "react-native": path.resolve(__dirname, "src/__tests__/__mocks__/react-native.ts"),
    },
  },
});
