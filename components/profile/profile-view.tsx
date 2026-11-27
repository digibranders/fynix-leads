import { Panel, PanelHeader } from "@/components/kit/panel";
import { ChangePasswordForm, ProfileDetailsForm } from "./profile-forms";
import { SecondFactorPanel } from "./second-factor-panel";

/** The profile page body, the same in all four portals: your details, then your password. Each is a panel with its own form. */
export function ProfileView({
  email,
  name,
  phone,
  secondFactor,
}: {
  /** The sign-in address, shown and not editable here. */
  email: string | null;
  name: string;
  phone: string | null;
  /** Fynix only: the second sign-in step. Left out for the other portals, which have none. */
  secondFactor?: { readonly enabled: boolean; readonly required: boolean };
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel aria-label="Your details">
        <PanelHeader title="Your details" />
        <div className="px-5 pb-5">
          <p className="pb-3 text-body text-ink-muted">The people on your side see these. You sign in with the email address your invite went to.</p>
          {email === null ? null : (
            <div className="mb-3 flex flex-col gap-0.5 rounded-sm bg-surface px-3 py-2">
              <span className="text-label text-ink-muted">Email (your sign-in)</span>
              <span className="text-body break-all text-ink">{email}</span>
            </div>
          )}
          <ProfileDetailsForm name={name} phone={phone} />
        </div>
      </Panel>
      <Panel aria-label="Password">
        <PanelHeader title="Password" />
        <div className="px-5 pb-5">
          <p className="pb-3 text-body text-ink-muted">Changing it signs you out of every other device.</p>
          <ChangePasswordForm />
        </div>
      </Panel>
      {secondFactor !== undefined && (
        <Panel aria-label="Second sign-in step">
          <PanelHeader title="Second sign-in step" />
          <div className="px-5 pb-5">
            <SecondFactorPanel enabled={secondFactor.enabled} required={secondFactor.required} />
          </div>
        </Panel>
      )}
    </div>
  );
}
