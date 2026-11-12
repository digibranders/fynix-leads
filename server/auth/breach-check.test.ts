import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BreachCheckUnavailableError, hibpBreachChecker, noBreachCheck } from "./breach-check";

const PASSWORD = "correct-horse-battery-staple";
const digest = createHash("sha1").update(PASSWORD).digest("hex").toUpperCase();
const [PREFIX, SUFFIX] = [digest.slice(0, 5), digest.slice(5)];

interface Call {
  readonly url: string;
  readonly headers: Record<string, string>;
}

/** A fake `fetch` that records its calls and answers with `body`. */
function fakeFetch(body: string, status = 200): { readonly fetch: typeof fetch; readonly calls: Call[] } {
  const calls: Call[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    return new Response(body, { status });
  };
  return { fetch: impl as typeof fetch, calls };
}

describe("hibpBreachChecker", () => {
  it("sends only the first five characters of the SHA-1 and asks for padding", async () => {
    const { fetch: fake, calls } = fakeFetch(`0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n${SUFFIX}:42\r\n`);
    await hibpBreachChecker({ fetch: fake }).isBreached(PASSWORD);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(calls[0]?.headers["add-padding"]).toBe("true");
    expect(calls[0]?.url).not.toContain(SUFFIX);
    expect(calls[0]?.url).not.toContain(PASSWORD);
  });

  it("reports a password whose suffix is in the answer with a count above zero", async () => {
    const { fetch: fake } = fakeFetch(`AAAAA45C4D1DEF81644B54AB7F969B88D65:3\r\n${SUFFIX}:42\r\n`);
    expect(await hibpBreachChecker({ fetch: fake }).isBreached(PASSWORD)).toBe(true);
  });

  it("does not report a password that is absent, or present only as a padding entry with a count of 0", async () => {
    const { fetch: absent } = fakeFetch("AAAAA45C4D1DEF81644B54AB7F969B88D65:3\r\n");
    expect(await hibpBreachChecker({ fetch: absent }).isBreached(PASSWORD)).toBe(false);
    const { fetch: padding } = fakeFetch(`${SUFFIX}:0\r\n`);
    expect(await hibpBreachChecker({ fetch: padding }).isBreached(PASSWORD)).toBe(false);
  });

  it("throws BreachCheckUnavailableError on a server error, a network failure and a timeout, never answering false", async () => {
    const { fetch: serverError } = fakeFetch("", 503);
    await expect(hibpBreachChecker({ fetch: serverError }).isBreached(PASSWORD)).rejects.toBeInstanceOf(BreachCheckUnavailableError);

    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(hibpBreachChecker({ fetch: offline }).isBreached(PASSWORD)).rejects.toBeInstanceOf(BreachCheckUnavailableError);

    const hangs = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    await expect(hibpBreachChecker({ fetch: hangs, timeoutMs: 20 }).isBreached(PASSWORD)).rejects.toBeInstanceOf(BreachCheckUnavailableError);
  });

  it("does not put the password or its hash in the error", async () => {
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const error = await hibpBreachChecker({ fetch: offline }).isBreached(PASSWORD).catch((caught: unknown) => caught);
    expect(String(error)).not.toContain(PASSWORD);
    expect(String(error)).not.toContain(SUFFIX);
  });
});

describe("noBreachCheck", () => {
  it("accepts everything", async () => {
    expect(await noBreachCheck.isBreached(PASSWORD)).toBe(false);
  });
});
