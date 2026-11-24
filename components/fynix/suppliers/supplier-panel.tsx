import { Megaphone, UsersThree, Users } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { countOf, formatDate } from "@/lib/fynix/format";
import { suppliersHref, type SupplierFilter } from "@/lib/fynix/suppliers";
import type { SupplierDetail } from "@/server/domain/supplier-overview";
import { StatusChip } from "@/components/kit/status-chip";
import { Tonal } from "@/components/kit/panel";
import { SidePanel } from "../side-panel";
import { AddAgencyButton, InvitePersonButton } from "./supplier-actions";

type Props = { detail: SupplierDetail; filter: SupplierFilter; query: string; canWrite: boolean };

function SectionTitle({ icon: Glyph, title, meta }: { icon: typeof Users; title: string; meta?: string }) {
  return (
    <div className="flex items-center gap-2 pb-2">
      <Glyph aria-hidden size={17} className="shrink-0 text-ink-2" />
      <h3 className="text-row font-semibold">{title}</h3>
      {meta && <span className="ml-auto text-table text-ink-muted">{meta}</span>}
    </div>
  );
}

/** The side panel for one supplier: partner agencies, people and campaigns. An admin also gets the two actions, unless the supplier is archived (nothing new goes into an archived organisation). */
export function SupplierPanel({ detail, filter, query, canWrite }: Props) {
  const closeHref = suppliersHref({ status: filter, q: query });
  const canAdd = canWrite && detail.status === "active";
  const shownPeople = detail.people.length;

  return (
    <SidePanel
      closeHref={closeHref}
      label={`${detail.name}, coordinator`}
      header={
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="quiet">
              <UsersThree aria-hidden />
              Coordinator
            </Badge>
            <Badge variant="quiet" className="font-mono font-medium">
              {detail.publicRef}
            </Badge>
            {detail.status === "archived" && <Badge variant="neutral">Archived</Badge>}
          </div>
          <h2 className="mt-3 text-name font-semibold tracking-title break-words">{detail.name}</h2>
          <p className="mt-0.5 text-body text-ink-muted">
            Coordinator since {formatDate(detail.createdAt, "UTC")}, {countOf(detail.campaigns.length, "campaign", "campaigns")}
          </p>
        </>
      }
      footer={
        canAdd ? (
          <>
            <InvitePersonButton supplierName={detail.name} organisations={[{ id: detail.id, name: detail.name }, ...detail.agencies.filter((row) => row.status === "active").map((row) => ({ id: row.id, name: row.name }))]} />
            <AddAgencyButton supplierId={detail.id} supplierName={detail.name} />
          </>
        ) : undefined
      }
    >
      <Tonal aria-label="Partner agencies">
        <SectionTitle icon={UsersThree} title="Partner agencies" meta={String(detail.agencies.length)} />
        {detail.agencies.length === 0 ? (
          <p className="text-table text-ink-muted">No partner agencies. The coordinator&apos;s own people submit the leads.</p>
        ) : (
          <table className="w-full text-table">
            <thead>
              <tr className="text-left text-ink-2">
                <th className="pb-1.5 font-normal">Agency</th>
                <th className="pb-1.5 text-right font-normal">People</th>
                <th className="pb-1.5 text-right font-normal">Campaigns</th>
              </tr>
            </thead>
            <tbody>
              {detail.agencies.map((row) => (
                <tr key={row.id} className="shadow-[inset_0_1px_0_var(--line)]">
                  <td className="py-2.5 pr-2 font-medium">
                    {row.name}
                    {row.status === "archived" && <span className="ml-1.5 text-ink-muted">(archived)</span>}
                  </td>
                  <td className="py-2.5 text-right">{row.peopleCount}</td>
                  <td className="py-2.5 text-right">{row.campaignCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tonal>

      <Tonal aria-label="People">
        <SectionTitle icon={Users} title="People" meta={detail.peopleTotal > shownPeople ? `${shownPeople} of ${detail.peopleTotal} shown` : String(shownPeople)} />
        {detail.people.length === 0 ? (
          <p className="text-table text-ink-2">Nobody has joined yet.{canAdd ? " Invite a person to start." : ""}</p>
        ) : (
          <ul>
            {detail.people.map((person) => (
              <li key={person.email} className="flex items-start gap-3 py-2.5 shadow-[inset_0_1px_0_var(--line)] first:shadow-none">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-row font-semibold">{person.name}</p>
                  <p className="truncate text-caption text-ink-muted">{person.email}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusChip kind="person" status={person.state} size="sm" />
                  <span className="text-caption text-ink-muted">{person.role === "manager" ? "Manager" : "Member"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tonal>

      <Tonal aria-label="Campaigns">
        <SectionTitle icon={Megaphone} title="Campaigns" meta={String(detail.campaigns.length)} />
        {detail.campaigns.length === 0 ? (
          <p className="text-table text-ink-2">No campaigns yet.</p>
        ) : (
          <ul>
            {detail.campaigns.map((row) => (
              <li key={row.id} className="relative flex items-start gap-3 py-2.5 shadow-[inset_0_1px_0_var(--line)] first:shadow-none">
                <div className="min-w-0 flex-1">
                  <Link href={`/fynix/campaigns/${row.publicRef}`} className="block truncate rounded-xs text-row font-semibold after:absolute after:inset-0 after:content-['']">
                    {row.name}
                  </Link>
                  <p className="truncate text-caption text-ink-muted">{row.clientName}</p>
                </div>
                <StatusChip kind="campaign" status={row.status} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Tonal>
    </SidePanel>
  );
}

/** Shown in place of the panel when the reference in the address is not a supplier. The list still works. */
export function PanelNotFound({ closeHref }: { closeHref: string }) {
  return (
    <SidePanel closeHref={closeHref} label="Coordinator not found" header={<h2 className="text-lead font-semibold">Coordinator not found</h2>}>
      <p className="text-body text-ink-muted">That reference is not a coordinator. Pick one from the list.</p>
    </SidePanel>
  );
}
