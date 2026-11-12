import { createDatabase } from "@/server/db/pool";
import { seedPlaceholderTerms } from "@/server/domain/placeholder-terms";
import { getToolingEnv } from "@/server/env";
import { loadEnvLocal } from "@/server/env-file";
import { runScript } from "@/server/run-script";

// Development only: writes the PLACEHOLDER terms (lib/terms/placeholder.ts) for any party that has none, so an invite can be
// redeemed against a development database. They are marked placeholder and are replaced with lawyer-approved text before
// any real user is invited (gate G2). It never overwrites a party that already has terms.
runScript(async () => {
  loadEnvLocal();
  const owner = createDatabase(getToolingEnv().DATABASE_URL_OWNER, { max: 1 });
  try {
    const written = await seedPlaceholderTerms(owner.db);
    console.log(written.length === 0 ? "Every party already has terms. Nothing was written." : `Wrote placeholder terms for: ${written.join(", ")}. They are placeholder text, not legal terms.`);
  } finally {
    await owner.close();
  }
});
