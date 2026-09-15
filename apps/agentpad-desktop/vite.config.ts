import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    fs: {
      allow: [repositoryRoot],
    },
  },
  test: {
    environment: "jsdom",
    // Windows hosted runners overcommit their small CPU allocation when each
    // JSDOM file gets its own worker. Run files deterministically; individual
    // tests remain fast and the CI result no longer depends on scheduler load.
    fileParallelism: false,
  },
});
