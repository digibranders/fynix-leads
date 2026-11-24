import type { RandomBytes } from "@/lib/domain/public-ref";
import type { AuthDatabase } from "@/server/auth/auth-database";
import type { Auth } from "@/server/auth/create-auth";
import type { Database } from "@/server/db/pool";
import type { MeetProvider } from "@/server/meet/provider";

/**
 * What the domain services run on, passed in so a test can use the test database, a fixed clock and a fake breach service,
 * and so no service reads the environment itself. The running app builds it once (server/domain/index.ts).
 */
export interface DomainDeps {
  /** The `leads_fynix` database: every admin action. */
  readonly fynixDb: Database;
  /** The `leads_auth` database: invite redemption, the terms read and the outbox sender. */
  readonly authDb: Database;
  /** The `leads_public` database: rate limits, which run outside any transaction. */
  readonly publicDb: Database;
  readonly now: () => Date;
  /** Randomness for invite tokens and public references. */
  readonly randomBytes: RandomBytes;
  /** The origin links in email point at, for example `https://leads.fynix.digital`. */
  readonly origin: string;
  /** False on an https deployment: gate G2, no invite while a party's current terms are still placeholder text. */
  readonly allowPlaceholderTerms: boolean;
  /** A Better Auth instance on the given database or transaction. Redemption runs it on a transaction. */
  readonly authFactory: (db: AuthDatabase) => Auth;
  /** Where a booked meeting's room comes from (phase 6). Absent means none: the meeting is booked with no link and the screens say it will follow. */
  readonly meet?: MeetProvider;
}
