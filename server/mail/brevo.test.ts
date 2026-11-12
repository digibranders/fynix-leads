import { describe, expect, it } from "vitest";
import { BREVO_SEND_URL, MAIL_SENDER, brevoTransport } from "./brevo";

const MAIL = { to: "person@example.com", subject: "Hello", text: "plain", html: "<p>html</p>" };
const KEY = "xkeysib-unit-test-key-0123456789";

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}
function fakeFetch(answer: () => Response | Promise<Response>): { readonly fetch: typeof fetch; readonly calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return answer();
    },
  };
}
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("brevoTransport", () => {
  it("posts the message to Brevo's transactional endpoint from hello@fynix.digital, with the key in a header only", async () => {
    const { fetch: send, calls } = fakeFetch(() => json(201, { messageId: "<202611121200.1@smtp-relay.brevo.com>" }));
    const result = await brevoTransport({ apiKey: KEY, fetch: send }).send(MAIL);
    expect(result).toEqual({ ok: true, providerId: "<202611121200.1@smtp-relay.brevo.com>" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(BREVO_SEND_URL);
    expect(calls[0]?.init.method).toBe("POST");
    expect((calls[0]?.init.headers as Record<string, string>)["api-key"]).toBe(KEY);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ sender: MAIL_SENDER, to: [{ email: "person@example.com" }], subject: "Hello", textContent: "plain", htmlContent: "<p>html</p>" });
    expect(MAIL_SENDER.email).toBe("hello@fynix.digital");
    expect(`${calls[0]?.url}${String(calls[0]?.init.body)}`).not.toContain(KEY);
  });

  it("accepts a success with no message id", async () => {
    const { fetch: send } = fakeFetch(() => new Response(null, { status: 201 }));
    expect(await brevoTransport({ apiKey: KEY, fetch: send }).send(MAIL)).toEqual({ ok: true, providerId: "accepted" });
  });

  it.each([
    [400, true],
    [422, true],
    [401, false],
    [403, false],
    [429, false],
    [500, false],
    [503, false],
  ])("treats a %s answer as permanent: %s", async (status, permanent) => {
    const { fetch: send } = fakeFetch(() => json(status, { code: "invalid_parameter", message: "Invalid email person@example.com" }));
    const result = await brevoTransport({ apiKey: KEY, fetch: send }).send(MAIL);
    expect(result).toEqual({ ok: false, permanent, reason: `brevo answered ${status} invalid_parameter` });
  });

  it("never puts the provider's message, the recipient or the key in a reason", async () => {
    const { fetch: send } = fakeFetch(() => json(400, { code: "invalid_parameter", message: `person@example.com rejected, key ${KEY}` }));
    const result = await brevoTransport({ apiKey: KEY, fetch: send }).send(MAIL);
    expect(JSON.stringify(result)).not.toContain("person@example.com");
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("drops an error code that is not short lower-case words, rather than trusting it", async () => {
    const { fetch: send } = fakeFetch(() => json(400, { code: "person@example.com" }));
    expect(await brevoTransport({ apiKey: KEY, fetch: send }).send(MAIL)).toEqual({ ok: false, permanent: true, reason: "brevo answered 400" });
  });

  it("returns a transient failure for a network error and for a timeout, and never throws", async () => {
    const down = brevoTransport({ apiKey: KEY, fetch: async () => { throw new TypeError(`fetch failed for ${KEY}`); } });
    expect(await down.send(MAIL)).toEqual({ ok: false, permanent: false, reason: "brevo could not be reached" });
    const slow = brevoTransport({ apiKey: KEY, timeoutMs: 20, fetch: (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))) });
    expect(await slow.send(MAIL)).toEqual({ ok: false, permanent: false, reason: "brevo timed out" });
  });
});
