import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside a server build. Tests run in Node, so it resolves to an empty module.
    alias: { "server-only": fileURLToPath(new URL("./lib/test/server-only-stub.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
