import Link from "next/link";

const LINKS = [
  { href: "/dev/system", label: "Design system" },
  { href: "/client/review", label: "Client review queue" },
  { href: "/client/leads/LD-4K9P", label: "Lead record" },
  { href: "/agency/leads", label: "Agency lead table" },
] as const;

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12 md:py-20">
      <h1 className="text-xl font-semibold tracking-tight">Fynix Leads</h1>
      <p className="mt-2 text-sm text-muted-foreground">Clickable prototype with sample data. Nothing here is saved.</p>
      <ul className="mt-8 divide-y overflow-hidden rounded-lg border bg-card">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex min-h-11 items-center justify-between gap-4 px-3 py-2 text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
            >
              <span className="font-medium">{link.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{link.href}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
