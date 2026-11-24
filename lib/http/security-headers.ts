/**
 * Headers every response carries. Page-specific rules in next.config.ts come after these and win on a clash (the reset and
 * invite pages send no referrer at all).
 *
 * `frame-ancestors` is the only Content-Security-Policy directive set here: a script policy needs a per-request nonce for
 * Next.js inline scripts and is a separate piece of work. HSTS has no `includeSubDomains`: this host is not the only thing
 * under its parent domain.
 */
export const SECURITY_HEADERS: readonly { readonly key: string; readonly value: string }[] = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];
