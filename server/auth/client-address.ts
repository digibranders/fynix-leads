const UNKNOWN_ADDRESS = "unknown";
/** The longest text of an IPv6 address with a zone is 45 characters; anything longer is not an address. */
const MAX_ADDRESS_LENGTH = 64;

/**
 * The network address a request came from, for the rate limits. It reads `x-real-ip` only. nginx sets that header from
 * the connecting address and replaces any value the client sent (`proxy_set_header X-Real-IP $remote_addr;`, a phase 6
 * deployment requirement). `x-forwarded-for` is never read: nginx appends to it, so its first entry is whatever the client
 * chose, and keying a limit on it lets anyone escape the limit by changing a header.
 *
 * With no header (local development, no proxy) every caller shares the address "unknown", which makes the per-network
 * limits stricter, not looser.
 */
export function clientAddressFrom(headers: Pick<Headers, "get">): string {
  const value = headers.get("x-real-ip")?.trim();
  return value === undefined || value === "" || value.length > MAX_ADDRESS_LENGTH ? UNKNOWN_ADDRESS : value;
}
