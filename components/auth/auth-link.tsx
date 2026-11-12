import Link from "next/link";

/** The underlined text link under a form, with a 44px tap target. */
export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center rounded-sm px-1 text-table font-semibold text-ink underline decoration-ink/35 underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
}
