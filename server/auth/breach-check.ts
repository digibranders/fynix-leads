import { createHash } from "node:crypto";

/** Answers one question: does this password appear in a known data breach? */
export interface BreachChecker {
  isBreached(password: string): Promise<boolean>;
}

/**
 * The check could not be made (the service is down, slow or answered with an error). The caller must not read this as
 * "the password is fine": server/auth/create-auth.ts refuses the password with a message that asks the person to try again.
 */
export class BreachCheckUnavailableError extends Error {
  constructor(reason: string, options?: { readonly cause: unknown }) {
    super(`The breached-password service could not be reached: ${reason}`, options);
    this.name = "BreachCheckUnavailableError";
  }
}

export interface HibpOptions {
  /** Defaults to the global `fetch`. A test passes a fake, so no test reaches the network. */
  readonly fetch?: typeof fetch;
  /** Give up after this long and treat the service as unavailable. Defaults to 3 seconds. */
  readonly timeoutMs?: number;
  /** Defaults to Have I Been Pwned's range API. */
  readonly baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.pwnedpasswords.com";
const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * Have I Been Pwned's k-anonymity range API: only the first five hex characters of the password's SHA-1 leave this
 * machine, never the password and never the full hash. The service answers with every hash suffix that shares those five
 * characters and how often it was seen, and the comparison happens here. `Add-Padding` asks for decoy entries with a
 * count of 0, so the size of the answer does not reveal how many real matches there were; a count of 0 is not a match.
 */
export function hibpBreachChecker(options: HibpOptions = {}): BreachChecker {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  return {
    async isBreached(password) {
      const digest = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
      const prefix = digest.slice(0, 5);
      const suffix = digest.slice(5);
      let body: string;
      try {
        const response = await doFetch(`${baseUrl}/range/${prefix}`, {
          headers: { "Add-Padding": "true" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new BreachCheckUnavailableError(`status ${response.status}`);
        body = await response.text();
      } catch (error) {
        if (error instanceof BreachCheckUnavailableError) throw error;
        throw new BreachCheckUnavailableError(error instanceof Error ? error.name : "unknown error", { cause: error });
      }
      return body.split("\n").some((line) => {
        const [candidate, count] = line.trim().split(":");
        return candidate === suffix && Number(count) > 0;
      });
    },
  };
}

/** Accepts every password. For development on a machine with no network; the environment schema refuses it on https. */
export const noBreachCheck: BreachChecker = { isBreached: async () => false };

/** The checker the environment asks for: `off` only for development without a network, anything else is the real service. */
export function breachCheckerFor(mode: "hibp" | "off" | undefined): BreachChecker {
  return mode === "off" ? noBreachCheck : hibpBreachChecker();
}
