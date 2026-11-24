/** Plain sentences for the audit actions a client or coordinator page can show. An action not listed reads from its own words ("member.update_details" is "Member update details"). */
const SENTENCES: Readonly<Record<string, string>> = {
  "organisation.create": "Added",
  "organisation.update": "Details changed",
  "organisation.archive": "Archived",
  "organisation.restore": "Restored",
  "client_profile.update": "Profile changed",
  "client_collateral.add": "Collateral added",
  "client_collateral.remove": "Collateral removed",
  "invite.issue": "Invite sent",
  "invite.revoke": "Invite revoked",
  "member.suspend": "Person suspended",
  "member.reactivate": "Person reactivated",
  "member.rename": "Person renamed",
  "member.update_details": "Person details changed",
  "agency_alias.set": "Fynix name set",
};

export function auditSentence(action: string): string {
  const known = SENTENCES[action];
  if (known !== undefined) return known;
  const words = action.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
