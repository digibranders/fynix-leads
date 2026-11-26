import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import { Facts } from "@/components/kit/facts";
import { ListRow } from "@/components/kit/list";
import { Panel, PanelHeader } from "@/components/kit/panel";
import type { ClientDetail } from "@/server/domain/client-overview";
import { ContactPanel } from "../records/contact-panel";
import { ContactsPanel } from "./contacts-panel";

const NOT_SET = "Not set";

function Block({ label, text }: { label: string; text: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-caption font-semibold text-ink-muted">{label}</h3>
      <p className="text-row whitespace-pre-line text-ink-2">{text === null || text === "" ? NOT_SET : text}</p>
    </div>
  );
}

/** True when a profile has any answer in it. */
const hasProfile = (profile: ClientDetail["profile"]): boolean => profile !== null && [profile.introduction, profile.services, profile.differentiator, profile.caseStudies ?? ""].some((text) => text.trim() !== "");

/**
 * The Overview tab: the company facts, the contact details, and, for a client that already has them, the profile and collateral links taken
 * before they were asked for with each campaign. Those two are read only now: new answers are given when a campaign is set up.
 */
export function ClientOverview({ client, canWrite }: { client: ClientDetail; canWrite: boolean }) {
  const { profile } = client;
  return (
    <div className="flex flex-col gap-4">
      <Facts
        items={[
          ["Name", client.name],
          ["Status", client.status === "archived" ? "Archived" : "Active"],
        ]}
        className="sm:grid-cols-2"
      />

      <ContactsPanel contacts={client.contacts} canWrite={canWrite} />

      <ContactPanel organisationId={client.id} contact={client.contact} canWrite={canWrite} mode="client" />

      {hasProfile(profile) ? (
        <Panel aria-label="Earlier profile">
          <PanelHeader title="Earlier profile" />
          <div className="flex flex-col gap-4 px-5 pb-5">
            <Block label="Introduction" text={profile?.introduction ?? null} />
            <Block label="Services" text={profile?.services ?? null} />
            <Block label="What sets them apart" text={profile?.differentiator ?? null} />
            <Block label="Case studies" text={profile?.caseStudies ?? null} />
          </div>
        </Panel>
      ) : null}

      {client.collateral.length > 0 ? (
        <Panel aria-label="Earlier collateral">
          <PanelHeader title="Earlier collateral" count={client.collateral.length} />
          <ul className="flex flex-col pb-3">
            {client.collateral.map((item) => (
              <ListRow
                key={item.id}
                title={
                  item.url === null ? (
                    item.title
                  ) : (
                    <a href={item.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-xs hover:underline">
                      {item.title}
                      <ArrowSquareOut aria-hidden size={14} />
                    </a>
                  )
                }
                sub={item.url ?? undefined}
              />
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
