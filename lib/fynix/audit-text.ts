/** Plain sentences for the audit actions a client or coordinator page can show. An action not listed reads from its own words ("member.update_details" is "Member update details"). */
const SENTENCES: Readonly<Record<string, string>> = {
  "organisation.create": "Added",
  "organisation.update": "Details changed",
  "organisation.archive": "Archived",
  "organisation.restore": "Restored",
  "client_profile.update": "Profile changed",
  "client_collateral.add": "Collateral added",
  "client_collateral.remove": "Collateral removed",
  "client_contact.add": "Contact person added",
  "client_contact.update": "Contact person changed",
  "client_contact.remove": "Contact person removed",
  "invite.issue": "Invite sent",
  "invite.revoke": "Invite revoked",
  "member.suspend": "Person suspended",
  "member.reactivate": "Person reactivated",
  "member.rename": "Person renamed",
  "member.update_details": "Person details changed",
  "member.two_factor_enable": "Second sign-in step turned on",
  "member.two_factor_disable": "Second sign-in step turned off",
  "member.backup_code_used": "Backup code used to sign in",
  "agency_alias.set": "Fynix name set",
  "campaign.create": "Campaign created",
  "campaign.update": "Campaign details changed",
  "campaign.close": "Campaign closed",
  "campaign.reopen": "Campaign reopened",
  "campaign.archive": "Campaign archived",
  "campaign.restore": "Campaign restored",
  "agreement.publish": "Agreement version published",
  "agreement.accept": "Agreement accepted",
  "campaign_host.add": "Host added",
  "campaign_host.deactivate": "Host paused",
  "lead.accept": "Meeting time confirmed",
  "lead.decline": "Rejected before the meeting",
  "meeting.outcome": "Outcome recorded",
  "lead.record_outcome": "Outcome recorded by Fynix",
  "lead.decide_accept": "Accepted by the client",
  "lead.decide_reject": "Rejected by the client",
  "lead.auto_accept": "Accepted automatically",
  "lead.overturn_rejection": "Rejection changed to accepted",
  "lead.decide_contest": "Contested outcome decided",
  "lead.mark_rejection_reviewed": "Rejection reviewed and left as it was",
  "lead.correct": "Lead corrected",
  "lead.answer_for_client": "Answered for the client",
  "lead.mark_lost": "Lead marked lost",
  "lead.approve_over_share": "Lead beyond a share approved",
};

export function auditSentence(action: string): string {
  const known = SENTENCES[action];
  if (known !== undefined) return known;
  const words = action.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
