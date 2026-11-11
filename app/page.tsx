import { CaretRight, Funnel } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

const GROUPS = [
  {
    title: "Reference",
    role: "Internal",
    links: [{ href: "/dev/system", label: "Design system", text: "Tokens, components and states, as built." }],
  },
  {
    title: "Client view",
    role: "Client",
    links: [
      { href: "/client/review", label: "Review queue", text: "Approve, reject or ask about each lead waiting for a decision." },
      { href: "/client/leads/LD-4K9P", label: "Lead record", text: "One lead with its meeting, activity and messages." },
    ],
  },
  {
    title: "Agency view",
    role: "Agency",
    links: [{ href: "/agency/leads", label: "Leads", text: "Campaign progress and every lead in one table." }],
  },
] as const;

export default function Home() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center px-4 py-12">
      <div className="rounded-lg bg-surface p-6 shadow-raised sm:p-8">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-sm bg-peach text-navy">
            <Funnel weight="fill" size={23} />
          </span>
          <h1 className="text-title font-semibold tracking-title">Fynix Leads</h1>
        </div>
        <p className="mt-3 text-body text-ink-2">Clickable prototype with sample data. Nothing here is saved.</p>

        <nav aria-label="Prototype screens" className="mt-7 flex flex-col gap-6">
          {GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5 px-3">
                <h2 className="text-value font-semibold">{group.title}</h2>
                <Badge variant="quiet" size="sm">
                  {group.role}
                </Badge>
              </div>
              <ul className="flex flex-col">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="flex min-h-14 items-center gap-3 rounded-sm px-3 py-2.5 transition-colors hover:bg-navy-04"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-row font-medium">{link.label}</span>
                        <span className="block text-table text-ink-2">{link.text}</span>
                      </span>
                      <CaretRight aria-hidden size={16} className="shrink-0 text-ink-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </div>
    </main>
  );
}
