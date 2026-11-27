"use client";

import { closeCampaignAction, publishAgreementAction, setLetterOpeningAction, setPrivacyLinkAction, setShareAction } from "@/server/fynix/actions";
import { ActionForm } from "./action-form";
import { BrandFields, QualificationFields, QuestionsFields } from "./campaign-rich-fields";
import { FormGroup, Hidden, NumberField, SelectField, TextAreaField, TextField } from "./form-parts";

export { BrandFields, QualificationFields, QuestionsFields };

type Defaults = {
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly rules: string;
  readonly notes: string;
};

/** Publishes the next version of the campaign agreement: one set of numbers for the client and the coordinator. The numbers start from the version in force. */
export function NewAgreementForm({ campaignId, defaults }: { campaignId: string; defaults: Defaults | null }) {
  return (
    <ActionForm action={publishAgreementAction} submitLabel="Publish version" pendingLabel="Publishing">
      <Hidden name="campaignId" value={campaignId} />
      <FormGroup title="The numbers">
        <NumberField name="monthlyTarget" label="Meetings per month" defaultValue={defaults === null ? "" : String(defaults.monthlyTarget)} />
        <NumberField name="totalTarget" label="Meetings in total" defaultValue={defaults === null ? "" : String(defaults.totalTarget)} />
      </FormGroup>
      <FormGroup title="The words">
        <TextAreaField name="rules" label="Counting rules" defaultValue={defaults?.rules ?? ""} helper="When a meeting counts, including no-shows, in words. It starts from the standard rules; change what this campaign needs." />
        <TextAreaField name="notes" label="Notes" defaultValue={defaults?.notes ?? ""} />
      </FormGroup>
    </ActionForm>
  );
}

type Option = { readonly id: string; readonly name: string };

/** Sets one agency's monthly share. Adding offers the agencies without a share; editing fixes the agency and starts from its current number. */
export function ShareForm({ campaignId, options, agency, suggested }: { campaignId: string; options: readonly Option[]; agency?: { readonly id: string; readonly name: string; readonly monthlyShare: number }; suggested?: number }) {
  return (
    <ActionForm action={setShareAction} submitLabel={agency === undefined ? "Add share" : "Save share"} pendingLabel="Saving">
      <Hidden name="campaignId" value={campaignId} />
      <FormGroup>
        {agency === undefined ? (
          <SelectField name="agencyOrgId" label="Agency" options={options.map((row) => ({ value: row.id, label: row.name }))} placeholder="Choose an agency" />
        ) : (
          <>
            <Hidden name="agencyOrgId" value={agency.id} />
            <p className="text-body text-ink-2">
              Share for <b className="font-semibold text-ink">{agency.name}</b>
            </p>
          </>
        )}
        <NumberField name="monthlyShare" label="Meetings per month" defaultValue={agency !== undefined ? String(agency.monthlyShare) : suggested === undefined || suggested === 0 ? "" : String(suggested)} />
      </FormGroup>
    </ActionForm>
  );
}

/** Closes a campaign. The note is optional and goes on the record. */
export function CloseCampaignForm({ campaignId, name }: { campaignId: string; name: string }) {
  return (
    <ActionForm action={closeCampaignAction} submitLabel="Close campaign" pendingLabel="Closing" savedMessage="Campaign closed">
      <Hidden name="campaignId" value={campaignId} />
      <FormGroup>
        <p className="text-body text-ink-2">
          {name} stops taking new leads and its shares and hosts become read only. Leads already submitted finish their course. You can reopen it later.
        </p>
        <TextAreaField name="note" label="Note (optional)" helper="Why it is closing. It goes on the campaign's activity." />
      </FormGroup>
    </ActionForm>
  );
}

/** Writes or replaces the campaign's opening paragraph for the confirmation letter to prospects. The rest of the letter is fixed. */
export function LetterOpeningForm({ campaignId, current }: { campaignId: string; current: string | null }) {
  return (
    <ActionForm action={setLetterOpeningAction} submitLabel="Save paragraph" pendingLabel="Saving" savedMessage="Paragraph saved">
      <Hidden name="campaignId" value={campaignId} />
      <FormGroup>
        <TextAreaField
          name="text"
          label="Opening paragraph"
          defaultValue={current ?? ""}
          helper="One paragraph, up to 600 characters. No web or email address, and never the name of Fynix, the coordinator or an agency."
        />
      </FormGroup>
    </ActionForm>
  );
}

/** Sets or replaces the client's privacy page link, the address named in every letter to a prospect. */
export function PrivacyLinkForm({ campaignId, current }: { campaignId: string; current: string | null }) {
  return (
    <ActionForm action={setPrivacyLinkAction} submitLabel="Save link" pendingLabel="Saving">
      <Hidden name="campaignId" value={campaignId} />
      <FormGroup>
        <TextField name="url" label="Privacy page link" type="text" inputMode="text" placeholder="https://" defaultValue={current ?? ""} helper="The client's own privacy page. It must start with https://." />
      </FormGroup>
    </ActionForm>
  );
}
