import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Integration tests share one test database, so files run one at a time. */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./lib/test/server-only-stub.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["server/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
