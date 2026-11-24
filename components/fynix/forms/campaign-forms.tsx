"use client";

import { CAMPAIGN_STATUSES, canMoveCampaign, type CampaignStatus } from "@/lib/domain/campaign-status";
import { addHostAction, createCampaignAction, publishAgreementAction, setShareAction, updateCampaignAction } from "@/server/fynix/actions";
import type { CampaignChoices, CampaignHeader } from "@/server/domain/campaign-overview";
import { ActionForm } from "./action-form";
import { FormGroup, Hidden, NumberField, SelectField, TextAreaField, TextField } from "./form-parts";

type Defaults = {
  readonly monthlyTarget: number;
  readonly totalTarget: number;
  readonly disputeWindowHours: number;
  readonly rules: string;
  readonly notes: string;
};

/** Publishes the next version of one party's agreement. The numbers start from the version in force. */
export function NewAgreementForm({ campaignId, party, defaults }: { campaignId: string; party: "client" | "supplier"; defaults: Defaults | null }) {
  return (
    <ActionForm action={publishAgreementAction} submitLabel="Publish version" pendingLabel="Publishing">
      <Hidden name="campaignId" value={campaignId} />
      <Hidden name="party" value={party} />
      <FormGroup title="The numbers">
        <NumberField name="monthlyTarget" label="Meetings per month" defaultValue={defaults === null ? "" : String(defaults.monthlyTarget)} />
        <NumberField name="totalTarget" label="Meetings in total" defaultValue={defaults === null ? "" : String(defaults.totalTarget)} />
        <NumberField name="disputeWindowHours" label="Dispute window, in hours" defaultValue={String(defaults?.disputeWindowHours ?? 48)} helper="How long after a meeting the client may dispute it." />
      </FormGroup>
      <FormGroup title="The words">
        <TextAreaField name="rules" label="Counting rules" rows={4} defaultValue={defaults?.rules ?? ""} helper="When a meeting counts, including no-shows and late cancellations, in words." />
        <TextAreaField name="notes" label="Notes" rows={3} defaultValue={defaults?.notes ?? ""} />
      </FormGroup>
    </ActionForm>
  );
}

type Option = { readonly id: string; readonly name: string };

/** Sets one agency's monthly share. Adding offers the agencies without a share; editing fixes the agency and starts from its current number. */
export function ShareForm({ campaignId, options, agency }: { campaignId: string; options: readonly Option[]; agency?: { readonly id: string; readonly name: string; readonly monthlyShare: number } }) {
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
        <NumberField name="monthlyShare" label="Meetings per month" defaultValue={agency === undefined ? "" : String(agency.monthlyShare)} />
      </FormGroup>
    </ActionForm>
  );
}

/** Adds a person at the client as a host of the campaign. A host who was paused comes back with the title given here. */
export function AddHostForm({ campaignId, candidates, clientName }: { campaignId: string; candidates: readonly { readonly memberId: string; readonly displayName: string }[]; clientName: string }) {
  return (
    <ActionForm action={addHostAction} submitLabel="Add host" pendingLabel="Adding">
      <Hidden name="campaignId" value={campaignId} />
      <FormGroup>
        <SelectField name="memberId" label={`Person at ${clientName}`} options={candidates.map((row) => ({ value: row.memberId, label: row.displayName }))} placeholder="Choose a person" />
        <TextField name="jobTitle" label="Job title" helper="What the supplier is told this person does, for example Head of FP&A." />
      </FormGroup>
    </ActionForm>
  );
}

type Brief = CampaignHeader["brief"];

const STATUS_LABEL: Record<CampaignStatus, string> = { draft: "Draft", active: "Active", paused: "Paused", completed: "Completed", archived: "Archived" };

/** The fields a campaign has, whether it is being made or changed: dates and targets, who to reach, how a lead is qualified, and the settings. */
function CampaignFields({ brief, name, timeZone, meetingMinutes }: { brief: Brief | null; name: string; timeZone: string; meetingMinutes: number }) {
  return (
    <>
      <FormGroup title="Name and dates">
        <TextField name="name" label="Campaign name" defaultValue={name} />
        <div className="grid grid-cols-2 gap-3">
          <TextField name="startDate" label="Starts" type="date" defaultValue={brief?.startDate ?? ""} />
          <TextField name="endDate" label="Ends" type="date" defaultValue={brief?.endDate ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField name="monthlyTarget" label="Meetings per month" defaultValue={brief === null ? "" : String(brief.monthlyTarget)} />
          <NumberField name="totalTarget" label="Meetings in total" defaultValue={brief === null ? "" : String(brief.totalTarget)} />
        </div>
      </FormGroup>
      <FormGroup title="Who to reach">
        <TextField name="geography" label="Geography" defaultValue={brief?.geography ?? ""} />
        <TextField name="industries" label="Industries" defaultValue={brief?.industries.join(", ") ?? ""} helper="Separate with commas." />
        <TextField name="companySize" label="Company size" defaultValue={brief?.companySize ?? ""} />
        <TextAreaField name="icp" label="Ideal customer" rows={3} defaultValue={brief?.icp ?? ""} />
        <TextField name="jobTitles" label="Job titles" defaultValue={brief?.jobTitles.join(", ") ?? ""} helper="Separate with commas." />
        <TextField name="seniority" label="Seniority" defaultValue={brief?.seniority ?? ""} />
        <TextField name="technologies" label="Technologies" defaultValue={brief?.technologies.join(", ") ?? ""} helper="Separate with commas." />
      </FormGroup>
      <FormGroup title="How a lead is qualified">
        <TextAreaField name="bantBudget" label="Budget" rows={2} defaultValue={brief?.bantBudget ?? ""} />
        <TextAreaField name="bantAuthority" label="Authority" rows={2} defaultValue={brief?.bantAuthority ?? ""} />
        <TextAreaField name="bantNeed" label="Need" rows={2} defaultValue={brief?.bantNeed ?? ""} />
        <TextAreaField name="bantTimeline" label="Timeline" rows={2} defaultValue={brief?.bantTimeline ?? ""} />
      </FormGroup>
      <FormGroup title="For the supplier">
        <TextAreaField name="instructions" label="Instructions" rows={4} defaultValue={brief?.instructions ?? ""} helper="Shown to the supplier and its agencies." />
        <TextAreaField name="internalNotes" label="Internal notes" rows={3} defaultValue={brief?.internalNotes ?? ""} helper="For Fynix only. Nobody outside Fynix sees this." />
      </FormGroup>
      <FormGroup title="Settings">
        <div className="grid grid-cols-2 gap-3">
          <TextField name="timeZone" label="Time zone" defaultValue={timeZone} helper="For example Europe/London. Counting uses it." />
          <NumberField name="meetingMinutes" label="Meeting length, minutes" defaultValue={String(meetingMinutes)} />
        </div>
      </FormGroup>
    </>
  );
}

/** Makes a draft campaign for one client, served by one supplier. Neither can be changed afterwards. */
export function CreateCampaignForm({ choices }: { choices: CampaignChoices }) {
  return (
    <ActionForm action={createCampaignAction} submitLabel="Create campaign" pendingLabel="Creating">
      <FormGroup title="Who it is for">
        <SelectField name="clientOrgId" label="Client" options={choices.clients.map((row) => ({ value: row.id, label: row.name }))} placeholder="Choose the client" />
        <SelectField name="agencyOrgId" label="Supplier" options={choices.suppliers.map((row) => ({ value: row.id, label: row.name }))} placeholder="Choose the supplier" helper="The supplier then gives the campaign to its own agencies." />
      </FormGroup>
      <CampaignFields brief={null} name="" timeZone="Europe/London" meetingMinutes={30} />
    </ActionForm>
  );
}

/** Changes a campaign's details, brief, settings and status. Only the moves a campaign may make are offered. */
export function EditCampaignForm({ campaign }: { campaign: CampaignHeader }) {
  const moves = CAMPAIGN_STATUSES.filter((status) => status === campaign.status || canMoveCampaign(campaign.status, status));
  return (
    <ActionForm action={updateCampaignAction} submitLabel="Save changes" pendingLabel="Saving">
      <Hidden name="campaignId" value={campaign.id} />
      <FormGroup title="Status">
        <SelectField name="status" label="Status" defaultValue={campaign.status} options={moves.map((status) => ({ value: status, label: STATUS_LABEL[status] }))} helper="A campaign takes leads only while it is Active." />
      </FormGroup>
      <CampaignFields brief={campaign.brief} name={campaign.name} timeZone={campaign.timeZone} meetingMinutes={campaign.meetingMinutes} />
    </ActionForm>
  );
}
