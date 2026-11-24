"use client";

import { Buildings, Handshake } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { AcceptCheckbox } from "@/components/auth/accept-checkbox";
import { AuthPanel } from "@/components/auth/auth-frame";
import { InviteUnavailable } from "@/components/auth/invite-unavailable";
import { Notice } from "@/components/auth/notice";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { TermsPanel, type TermsView } from "@/components/auth/terms-panel";
import { PASSWORD_RULE } from "@/lib/auth/password-policy";
import type { OrganisationKind } from "@/lib/auth/session-lifetime";
import { INVITE_IDLE } from "@/lib/domain/invite-form-state";
import { inviteFeedbackFor } from "@/lib/domain/invite-feedback";
import {
  INVITE_ACCEPT_LABEL,
  INVITE_ACCOUNT_LABEL,
  INVITE_EMAIL_LABEL,
  INVITE_LEDE,
  INVITE_SUBMIT_LABEL,
  INVITE_SUBMIT_PENDING_LABEL,
  INVITE_UNAVAILABLE_TITLE,
  partyLabel,
  welcomeHeading,
} from "@/lib/domain/invite-page-copy";
import { redeemInviteAction } from "@/server/domain/actions";

type Props = {
  token: string;
  name: string;
  email: string;
  party: OrganisationKind;
  /** An invite into a partner agency, so the account is labelled "Agency" and not "Coordinator". */
  partner: boolean;
  /** The current terms. Their id travels in a hidden field so the server knows which text was on the page. */
  terms: TermsView & { readonly id: string };
};

/** The token arrives as a prop from the server page and travels in a hidden field. It is never printed. */
export function AcceptInviteForm({ token, name, email, party, partner, terms }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(redeemInviteAction, INVITE_IDLE);
  const passwordRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLInputElement>(null);
  const { note, termsNote, passwordError, boxError } = inviteFeedbackFor(state);

  useEffect(() => {
    const feedback = inviteFeedbackFor(state);
    // A refused password empties the field (React resets the form); put the cursor back in it. The box message focuses the box.
    if (feedback.passwordError !== null) passwordRef.current?.focus();
    else if (feedback.boxError !== null) boxRef.current?.focus();
    // New terms were published: read them again from the server, once. The box below is keyed on the terms id, so it comes back empty.
    if (state.status === "terms-changed") router.refresh();
  }, [state, router]);

  if (state.status === "unavailable") {
    return (
      <AuthPanel title={INVITE_UNAVAILABLE_TITLE}>
        <InviteUnavailable reason={state.reason} message={state.message} />
      </AuthPanel>
    );
  }

  const PartyIcon = party === "agency" ? Handshake : Buildings;
  return (
    <AuthPanel wide title={welcomeHeading(name)} lede={INVITE_LEDE}>
      <dl className="mt-5 flex flex-col gap-2.5 rounded-sm bg-navy-04 px-4 py-3.5">
        <div className="flex min-h-[30px] items-center justify-between gap-4">
          <dt className="shrink-0 text-label font-medium text-ink-muted">{INVITE_EMAIL_LABEL}</dt>
          <dd className="min-w-0 text-right text-body font-medium [overflow-wrap:anywhere]">{email}</dd>
        </div>
        <div className="flex min-h-[30px] items-center justify-between gap-4">
          <dt className="shrink-0 text-label font-medium text-ink-muted">{INVITE_ACCOUNT_LABEL}</dt>
          <dd>
            <span className="inline-flex h-[30px] items-center gap-1.5 rounded-xs bg-navy-07 pr-[11px] pl-2.5 text-table font-semibold">
              <PartyIcon aria-hidden size={17} />
              {partyLabel(party, partner)}
            </span>
          </dd>
        </div>
      </dl>
      <form action={formAction} noValidate className="mt-[22px] flex flex-col gap-[18px]">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="termsId" value={terms.id} />
        <PasswordField id="password" name="password" label="Password" autoComplete="new-password" inputRef={passwordRef} hint={PASSWORD_RULE} error={passwordError} />
        {termsNote !== null && <Notice tone="blue">{termsNote}</Notice>}
        <TermsPanel terms={terms} />
        <AcceptCheckbox key={terms.id} id="accept" name="accept" label={INVITE_ACCEPT_LABEL} inputRef={boxRef} error={boxError} />
        {note !== null && <Notice tone="amber">{note}</Notice>}
        <SubmitButton pending={pending} label={INVITE_SUBMIT_LABEL} pendingLabel={INVITE_SUBMIT_PENDING_LABEL} />
      </form>
    </AuthPanel>
  );
}
