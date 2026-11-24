import { Info, PencilSimple, Plus, Power, Trash } from "@phosphor-icons/react/dist/ssr";
import { Notice } from "@/components/auth/notice";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import { removePrivacyLinkAction, setProspectEmailAction } from "@/server/fynix/actions";
import { PrivacyLinkForm } from "../forms/campaign-forms";
import { FormSheet } from "../forms/form-sheet";
import { InlineAction } from "../forms/inline-action";

type Props = {
  readonly campaignId: string;
  readonly privacyUrl: string | null;
  readonly prospectEmailEnabled: boolean;
  /** Whether the server sends launch emails at all (`LAUNCH_EMAILS_ENABLED`). Read-only here. */
  readonly launchEmailsOn: boolean;
  /** Only a Fynix admin changes either setting. */
  readonly canWrite: boolean;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-3 shadow-[inset_0_1px_0_var(--line)] first:shadow-none @md:grid-cols-[200px_minmax(0,1fr)] @md:gap-4">
      <dt className="text-table text-ink-muted">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-2 text-body">{children}</dd>
    </div>
  );
}

/** The client's privacy page link and the switch that lets the portal email prospects of this campaign. Staff read it; an admin changes it. */
export function ProspectEmailPanel({ campaignId, privacyUrl, prospectEmailEnabled, launchEmailsOn, canWrite }: Props) {
  return (
    <Panel aria-label="Prospect email">
      <PanelHeader title="Prospect email" />
      <p className="flex items-start gap-2 px-5 pb-2 text-caption text-ink-muted">
        <Info aria-hidden size={14} className="mt-px shrink-0" />
        Letters to prospects name the client and link to its privacy page. They go out only when a link is set and the switch is on.
      </p>
      <dl className="px-5 pb-4">
        <Row label="Client privacy page">
          {privacyUrl === null ? (
            <span className="text-ink-muted">Not set</span>
          ) : (
            <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
              {privacyUrl}
            </a>
          )}
          {canWrite ? (
            <div className="flex flex-wrap items-start gap-2">
              <FormSheet
                trigger={
                  <Button variant="secondary" size="sm">
                    {privacyUrl === null ? <Plus aria-hidden /> : <PencilSimple aria-hidden />}
                    {privacyUrl === null ? "Add link" : "Change link"}
                  </Button>
                }
                title="Client privacy page"
                description="The address of the client's own privacy page, named in letters to prospects."
              >
                <PrivacyLinkForm campaignId={campaignId} current={privacyUrl} />
              </FormSheet>
              {privacyUrl === null ? null : (
                <InlineAction action={removePrivacyLinkAction} fields={{ campaignId }} label="Remove the privacy link" savedMessage="Link removed">
                  <Trash aria-hidden />
                  Remove link
                </InlineAction>
              )}
            </div>
          ) : null}
          {canWrite && privacyUrl !== null && prospectEmailEnabled ? <p className="text-caption text-ink-muted">Removing the link also switches letters to prospects off.</p> : null}
        </Row>
        <Row label="Send letters to prospects">
          <span className="font-semibold">{prospectEmailEnabled ? "On" : "Off"}</span>
          {canWrite ? (
            <InlineAction
              action={setProspectEmailAction}
              fields={{ campaignId, enabled: prospectEmailEnabled ? "false" : "true" }}
              label={prospectEmailEnabled ? "Switch letters to prospects off" : "Switch letters to prospects on"}
              savedMessage={prospectEmailEnabled ? "Letters to prospects are off" : "Letters to prospects are on"}
            >
              <Power aria-hidden />
              {prospectEmailEnabled ? "Switch off" : "Switch on"}
            </InlineAction>
          ) : (
            <p className="text-caption text-ink-muted">A Fynix admin changes this.</p>
          )}
        </Row>
      </dl>
      {launchEmailsOn ? null : (
        <Notice tone="amber" compact role="note" className="mx-5 mb-4">
          Launch emails are off on this server. Sending also needs the launch switch turned on there, whatever is set here.
        </Notice>
      )}
    </Panel>
  );
}
