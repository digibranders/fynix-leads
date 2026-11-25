"use client";

import { addClientAction, addCollateralAction, updateProfileAction } from "@/server/fynix/actions";
import type { ClientProfileRecord } from "@/server/domain/organisations";
import { ActionForm, type PageMode } from "./action-form";
import { ContactFields } from "./contact-forms";
import { ConfirmField, FormGroup, Hidden, TextAreaField, TextField, TimeZoneField } from "./form-parts";

const PROFILE_HELP = {
  introduction: "How the client is introduced to a prospect, in a few sentences.",
  services: "What the client sells.",
  differentiator: "The one thing that sets the client apart.",
  caseStudies: "Optional. Short notes on past work, or paste a link.",
} as const;

function ProfileFields({ profile }: { profile: ClientProfileRecord | null }) {
  return (
    <FormGroup title="Profile">
      <TextAreaField name="introduction" label="Introduction" rows={4} defaultValue={profile?.introduction ?? ""} helper={PROFILE_HELP.introduction} />
      <TextAreaField name="services" label="Services" rows={3} defaultValue={profile?.services ?? ""} helper={PROFILE_HELP.services} />
      <TextAreaField name="differentiator" label="What sets them apart" rows={3} defaultValue={profile?.differentiator ?? ""} helper={PROFILE_HELP.differentiator} />
      <TextAreaField name="caseStudies" label="Case studies (optional)" rows={3} defaultValue={profile?.caseStudies ?? ""} helper={PROFILE_HELP.caseStudies} />
    </FormGroup>
  );
}

/** Adds a client with its time zone, profile and, if given, one collateral link. A second client of the same name needs a tick. */
export function AddClientForm({ page }: { page?: PageMode }) {
  return (
    <ActionForm action={addClientAction} submitLabel="Add client" pendingLabel="Adding" page={page}>
      <FormGroup>
        <TextField name="name" label="Client name" helper="The company name. Agencies see it only on campaigns they work on." />
        <TimeZoneField helper="Where the client works, for example Europe/London. Start typing to pick one. Optional." />
        <ConfirmField name="confirmDuplicate" label="Add it anyway" />
      </FormGroup>
      <ContactFields />
      <ProfileFields profile={null} />
      <FormGroup title="Collateral (optional)">
        <TextField name="collateralTitle" label="Link title" helper="For example: Company brochure." />
        <TextField name="collateralUrl" label="Link address" type="text" inputMode="text" helper="Starts with https://" />
      </FormGroup>
    </ActionForm>
  );
}

export function EditProfileForm({ clientOrgId, profile }: { clientOrgId: string; profile: ClientProfileRecord | null }) {
  return (
    <ActionForm action={updateProfileAction} submitLabel="Save profile" pendingLabel="Saving">
      <Hidden name="clientOrgId" value={clientOrgId} />
      <ProfileFields profile={profile} />
    </ActionForm>
  );
}

export function AddCollateralForm({ clientOrgId }: { clientOrgId: string }) {
  return (
    <ActionForm action={addCollateralAction} submitLabel="Add link" pendingLabel="Adding">
      <Hidden name="clientOrgId" value={clientOrgId} />
      <FormGroup>
        <TextField name="title" label="Title" helper="For example: Company brochure." />
        <TextField name="url" label="Address" helper="Starts with https://" />
      </FormGroup>
    </ActionForm>
  );
}
