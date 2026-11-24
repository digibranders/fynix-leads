import { ArrowSquareOut, Plus, PencilSimple, Trash } from "@phosphor-icons/react/dist/ssr";
import { Facts } from "@/components/kit/facts";
import { ListRow } from "@/components/kit/list";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import type { ClientDetail } from "@/server/domain/client-overview";
import { removeCollateralAction } from "@/server/fynix/actions";
import { FormSheet } from "../forms/form-sheet";
import { InlineAction } from "../forms/inline-action";
import { AddCollateralForm, EditProfileForm } from "../forms/client-forms";

const NOT_SET = "Not set";

function Block({ label, text }: { label: string; text: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-caption font-semibold text-ink-muted">{label}</h3>
      <p className="text-row whitespace-pre-line text-ink-2">{text === null || text === "" ? NOT_SET : text}</p>
    </div>
  );
}

/** The Overview tab: the company facts, the profile the coordinator and agencies read, and the collateral links. Staff see it with no edit buttons. */
export function ClientOverview({ client, canWrite }: { client: ClientDetail; canWrite: boolean }) {
  const { profile } = client;
  return (
    <div className="flex flex-col gap-4">
      <Facts
        items={[
          ["Company name", client.name],
          ["Time zone", client.timeZone ?? NOT_SET],
          ["Status", client.status === "archived" ? "Archived" : "Active"],
        ]}
        className="sm:grid-cols-3"
      />

      <Panel aria-label="Client profile">
        <PanelHeader
          title="Profile"
          action={
            canWrite ? (
              <FormSheet
                trigger={
                  <Button variant="secondary" size="sm">
                    <PencilSimple aria-hidden />
                    Edit profile
                  </Button>
                }
                title="Edit profile"
                description="How the client is introduced to prospects. Its coordinator and agencies read it."
              >
                <EditProfileForm clientOrgId={client.id} profile={profile} />
              </FormSheet>
            ) : null
          }
        />
        <div className="flex flex-col gap-4 px-5 pb-5">
          <Block label="Introduction" text={profile?.introduction ?? null} />
          <Block label="Services" text={profile?.services ?? null} />
          <Block label="What sets them apart" text={profile?.differentiator ?? null} />
          <Block label="Case studies" text={profile?.caseStudies ?? null} />
        </div>
      </Panel>

      <Panel aria-label="Collateral">
        <PanelHeader
          title="Collateral"
          count={client.collateral.length}
          action={
            canWrite ? (
              <FormSheet
                trigger={
                  <Button variant="secondary" size="sm">
                    <Plus aria-hidden />
                    Add link
                  </Button>
                }
                title="Add collateral link"
                description="A brochure, a deck or a page agencies can use when they talk about the client."
              >
                <AddCollateralForm clientOrgId={client.id} />
              </FormSheet>
            ) : null
          }
        />
        {client.collateral.length === 0 ? (
          <p className="px-5 pb-5 text-body text-ink-muted">No collateral yet.</p>
        ) : (
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
                trailing={
                  canWrite ? (
                    <InlineAction action={removeCollateralAction} fields={{ collateralId: item.id }} label={`Remove ${item.title}`} variant="ghost">
                      <Trash aria-hidden />
                      Remove
                    </InlineAction>
                  ) : null
                }
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
