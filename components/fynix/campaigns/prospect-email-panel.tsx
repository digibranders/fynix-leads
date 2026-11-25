import { CaretDown, Info, PencilSimple, Plus, Power, Trash } from "@phosphor-icons/react/dist/ssr";
import { Notice } from "@/components/auth/notice";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import { renderLaunchEmail } from "@/lib/email/launch-templates";
import { SAMPLES } from "@/lib/email/samples";
import { removeLetterOpeningAction, removePrivacyLinkAction, setProspectEmailAction } from "@/server/fynix/actions";
import { LetterOpeningForm, PrivacyLinkForm } from "../forms/campaign-forms";
import { FormSheet } from "../forms/form-sheet";
import { InlineAction } from "../forms/inline-action";

type Props = {
  readonly campaignId: string;
  readonly privacyUrl: string | null;
  readonly prospectEmailEnabled: boolean;
  /** The campaign's own opening paragraph for the confirmation letter, or null for the default wording. */
  readonly letterOpening: string | null;
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

/** The confirmation letter as a prospect would read it, from made-up sample names and this campaign's paragraph. Sandboxed with no permissions, like the Templates screen. */
function LetterPreview({ letterOpening }: { readonly letterOpening: string | null }) {
  const sample = SAMPLES.prospect_confirmed;
  if (sample.template !== "prospect_confirmed") return null;
  const mail = renderLaunchEmail({ template: "prospect_confirmed", params: { ...sample.params, ...(letterOpening === null ? {} : { letterOpening }) } }, null);
  return (
    <details className="group rounded-md open:bg-tonal">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 text-table outline-none hover:bg-navy-05 focus-visible:shadow-[inset_0_0_0_2px_var(--navy)] [&::-webkit-details-marker]:hidden">
        <span className="flex-1 font-semibold">Preview the confirmation letter</span>
        <CaretDown aria-hidden size={16} className="shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <p className="text-caption text-ink-muted">The names, the time and the links are samples. The moved, cancelled and reminder letters keep their own wording.</p>
        <iframe title="Preview of the confirmation letter" sandbox="" srcDoc={mail.html} loading="lazy" className="h-[460px] w-full rounded-md bg-surface" />
      </div>
    </details>
  );
}

/** The client's privacy page link, the campaign's opening paragraph and the switch that lets the portal email prospects of this campaign. Staff read it; an admin changes it. */
export function ProspectEmailPanel({ campaignId, privacyUrl, prospectEmailEnabled, letterOpening, launchEmailsOn, canWrite }: Props) {
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
        <Row label="Opening paragraph">
          {letterOpening === null ? <span className="text-ink-muted">Default wording</span> : <p className="max-w-[65ch]">{letterOpening}</p>}
          {canWrite ? (
            <div className="flex flex-wrap items-start gap-2">
              <FormSheet
                trigger={
                  <Button variant="secondary" size="sm">
                    {letterOpening === null ? <Plus aria-hidden /> : <PencilSimple aria-hidden />}
                    {letterOpening === null ? "Write paragraph" : "Change paragraph"}
                  </Button>
                }
                title="Opening paragraph"
                description="The first paragraph of the letter that confirms a meeting to a prospect of this campaign. The time, the join link, the signature and the privacy line are added for you."
              >
                <LetterOpeningForm campaignId={campaignId} current={letterOpening} />
              </FormSheet>
              {letterOpening === null ? null : (
                <InlineAction action={removeLetterOpeningAction} fields={{ campaignId }} label="Remove the opening paragraph" savedMessage="Paragraph removed">
                  <Trash aria-hidden />
                  Remove paragraph
                </InlineAction>
              )}
            </div>
          ) : null}
          <LetterPreview letterOpening={letterOpening} />
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
