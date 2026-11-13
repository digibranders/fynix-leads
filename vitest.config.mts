import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside a server build. Tests run in Node, so it resolves to an empty module.
    alias: { "server-only": fileURLToPath(new URL("./lib/test/server-only-stub.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "server/**/*.test.ts", "components/**/*.test.tsx"],
    // Unit tests never need a database. Integration tests run through vitest.integration.config.mts.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
});
