import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const environment = loadEnv("test", process.cwd(), "");

export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
      "next-auth/adapters": fileURLToPath(
        new URL("./node_modules/@auth/core/adapters.js", import.meta.url),
      ),
      "server-only": fileURLToPath(
        new URL("./src/test/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    fileParallelism: false,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    env: environment,
  },
});
