"use client";

import { addHostAction, closeCampaignAction, publishAgreementAction, setLetterOpeningAction, setPrivacyLinkAction, setShareAction, updateCampaignAction } from "@/server/fynix/actions";
import type { CampaignHeader } from "@/server/domain/campaign-overview";
import { useId, useState } from "react";
import { Choice } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ActionForm, useFormState } from "./action-form";
import { FormGroup, Hidden, NumberField, SelectField, TextAreaField, TextField, TimeZoneField } from "./form-parts";

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

/**
 * Adds a person at the client as a host of the campaign. Choosing the person fills in their job title (the one on their own record), which can
 * still be changed. A host who was paused comes back with the title given here.
 */
export function AddHostForm({ campaignId, candidates, clientName }: { campaignId: string; candidates: readonly { readonly memberId: string; readonly displayName: string; readonly jobTitle: string | null }[]; clientName: string }) {
  const state = useFormState();
  const personId = useId();
  const titleId = useId();
  const [person, setPerson] = useState("");
  const [title, setTitle] = useState("");
  const error = (name: string) => (state.status === "error" ? state.fields[name] : undefined);

  return (
    <ActionForm action={addHostAction} submitLabel="Add host" pendingLabel="Adding">
      <Hidden name="campaignId" value={campaignId} />
      <FormGroup>
        <Field id={personId} label={`Person at ${clientName}`} error={error("memberId")}>
          <Choice
            id={personId}
            name="memberId"
            value={person}
            onValueChange={(next) => {
              setPerson(next);
              setTitle(candidates.find((row) => row.memberId === next)?.jobTitle ?? "");
            }}
            options={candidates.map((row) => ({ value: row.memberId, label: row.displayName }))}
            placeholder="Choose a person"
            invalid={error("memberId") !== undefined}
          />
        </Field>
        <Field id={titleId} label="Job title" helper="What the coordinator is told this person does. It starts from their own job title." error={error("jobTitle")}>
          <Input id={titleId} name="jobTitle" value={title} autoComplete="off" onChange={(event) => setTitle(event.target.value)} aria-invalid={error("jobTitle") === undefined ? undefined : true} />
        </Field>
      </FormGroup>
    </ActionForm>
  );
}

type Brief = CampaignHeader["brief"];

/** What the campaign looks for: who the decision-makers are, the industries and the markets. Job titles and industries are lists, separated with commas. */
export function QualificationFields({ brief }: { brief: Brief | null }) {
  return (
    <FormGroup title="Qualification criteria">
      <TextField name="jobTitles" label="Target decision-makers" defaultValue={brief?.jobTitles.join(", ") ?? ""} helper="Job titles. Separate with commas." />
      <TextField name="industries" label="Target industries" defaultValue={brief?.industries.join(", ") ?? ""} helper="Separate with commas." />
      <TextField name="geography" label="Target geographical markets" defaultValue={brief?.geography ?? ""} />
    </FormGroup>
  );
}

/** The answers about the client's brand and services, in the order of the set-up sheet. Free text. */
export function BrandFields({ brief }: { brief: Brief | null }) {
  return (
    <FormGroup title="Brand and service information">
      <TextAreaField name="pitchIntroduction" label="How do you introduce your brand to prospects?" defaultValue={brief?.pitchIntroduction ?? ""} />
      <TextAreaField name="pitchServices" label="What services do you offer?" defaultValue={brief?.pitchServices ?? ""} />
      <TextAreaField name="pitchDifferentiator" label="What is your key differentiating factor (USP)?" defaultValue={brief?.pitchDifferentiator ?? ""} />
      <TextAreaField name="pitchCollaterals" label="What marketing collaterals are available?" defaultValue={brief?.pitchCollaterals ?? ""} helper="Paste links or describe them." />
      <TextAreaField name="pitchCaseStudies" label="Are there any case studies or success stories?" defaultValue={brief?.pitchCaseStudies ?? ""} />
    </FormGroup>
  );
}

/** The questions the sales team asks a prospect to qualify them for a meeting. Free text. */
export function QuestionsFields({ brief }: { brief: Brief | null }) {
  return (
    <FormGroup title="Critical qualifying questions">
      <TextAreaField name="qualifyingQuestions" label="Questions to ask a prospect" defaultValue={brief?.qualifyingQuestions ?? ""} helper="The 5 to 6 key questions our sales team asks prospects to qualify them for a meeting. One per line." />
    </FormGroup>
  );
}

/** The two emails sent to prospects: the first introduction, and the follow-up. Free text. */
export function EmailFields({ brief }: { brief: Brief | null }) {
  return (
    <FormGroup title="Email copies">
      <TextAreaField name="firstEmail" label="First email" defaultValue={brief?.firstEmail ?? ""} helper="The initial introduction, highlighting the key offerings and value proposition." />
      <TextAreaField name="secondEmail" label="Second email" defaultValue={brief?.secondEmail ?? ""} helper="The follow-up for prospects who do not respond to the first email." />
    </FormGroup>
  );
}

/** Changes a campaign's details, brief and settings. Its status changes with Make active, Close and Reopen on the campaign page. */
export function EditCampaignForm({ campaign }: { campaign: CampaignHeader }) {
  const { brief } = campaign;
  return (
    <ActionForm action={updateCampaignAction} submitLabel="Save changes" pendingLabel="Saving">
      <Hidden name="campaignId" value={campaign.id} />
      <FormGroup title="Campaign">
        <TextField name="name" label="Campaign name" defaultValue={campaign.name} />
        <SelectField
          name="primaryContactId"
          label="Contact person"
          options={campaign.clientContacts.map((person) => ({ value: person.id, label: person.jobTitle === null ? person.name : `${person.name}, ${person.jobTitle}` }))}
          defaultValue={brief.primaryContactId ?? ""}
          placeholder="No contact person chosen"
          helper={campaign.clientContacts.length === 0 ? "This client has no contact people yet. Add them on the client page." : "Approves the leads and gives feedback for this campaign."}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField name="startDate" label="Starts" type="date" defaultValue={brief.startDate} />
          <TextField name="endDate" label="Ends" type="date" defaultValue={brief.endDate} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField name="monthlyTarget" label="Meetings per month" defaultValue={String(brief.monthlyTarget)} />
          <NumberField name="totalTarget" label="Meetings in total" defaultValue={String(brief.totalTarget)} />
        </div>
        <TimeZoneField defaultValue={campaign.timeZone} helper="Counting uses it. Search, or type Area/City." />
        <NumberField name="meetingMinutes" label="Meeting length, minutes" defaultValue={String(campaign.meetingMinutes)} />
      </FormGroup>
      <BrandFields brief={brief} />
      <QualificationFields brief={brief} />
      <QuestionsFields brief={brief} />
      <EmailFields brief={brief} />
      <FormGroup title="For Fynix">
        <TextAreaField name="internalNotes" label="Internal notes" defaultValue={brief.internalNotes ?? ""} helper="For Fynix only. Nobody outside Fynix sees this." />
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
