import { defineConfig } from "drizzle-kit";

// Only used to generate SQL from the schema (`pnpm db:generate`). It never connects: migrations are applied by
// scripts/db-migrate.ts, as the owner role.
export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema/index.ts",
  out: "./server/db/migrations",
  strict: true,
  verbose: true,
});
