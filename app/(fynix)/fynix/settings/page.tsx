import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/fynix/card";
import { FynixPageHeader } from "@/components/fynix/page-header";
import { ListBodySkeleton } from "@/components/fynix/skeletons";
import { Badge } from "@/components/ui/badge";
import { getDomain } from "@/server/domain";
import { readSettings } from "@/server/domain/settings-overview";
import { requireFynix } from "@/server/fynix/session";

export const metadata: Metadata = { title: "Settings" };

const PARTY_LABEL = { client: "Clients", agency: "Suppliers and agencies" } as const;

async function Settings() {
  const view = await requireFynix();
  const { team, terms } = await readSettings(getDomain(), view.actor);
  return (
    <div className="flex flex-col gap-4">
      <Card aria-labelledby="team-heading" className="p-4">
        <h2 id="team-heading" className="text-value font-semibold tracking-[-0.005em]">
          Fynix team
        </h2>
        <ul className="mt-2 divide-y divide-line">
          {team.map((person) => (
            <li key={person.email} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span>
                <span className="block text-row font-semibold">{person.name}</span>
                <span className="block text-table text-ink-2">{person.email}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge variant="quiet">{person.role === "manager" ? "Admin" : "Staff"}</Badge>
                {person.status === "suspended" && <Badge variant="red">Suspended</Badge>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card aria-labelledby="terms-heading" className="p-4">
        <h2 id="terms-heading" className="text-value font-semibold tracking-[-0.005em]">
          Terms in force
        </h2>
        {terms.length === 0 ? (
          <p className="mt-2 text-body text-ink-2">No terms are published.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {terms.map((doc) => (
              <li key={doc.party} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span>
                  <span className="block text-row font-semibold">{PARTY_LABEL[doc.party]}</span>
                  <span className="block text-table text-ink-2">
                    {doc.title}, version {doc.version}, published {doc.publishedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
                {doc.placeholder && <Badge variant="amber">Placeholder text</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <FynixPageHeader title="Settings" subtitle="Who works at Fynix and which terms people accept" />
      <Suspense fallback={<ListBodySkeleton />}>
        <Settings />
      </Suspense>
    </>
  );
}
