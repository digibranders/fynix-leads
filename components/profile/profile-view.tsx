import { Panel, PanelHeader } from "@/components/kit/panel";
import { ChangePasswordForm, ProfileDetailsForm } from "./profile-forms";

/** The profile page body, the same in all four portals: your details, then your password. Each is a panel with its own form. */
export function ProfileView({ name, jobTitle, phone }: { name: string; jobTitle: string | null; phone: string | null }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel aria-label="Your details">
        <PanelHeader title="Your details" />
        <div className="px-5 pb-5">
          <p className="pb-3 text-body text-ink-muted">The people on your side see these. You sign in with the email address your invite went to.</p>
          <ProfileDetailsForm name={name} jobTitle={jobTitle} phone={phone} />
        </div>
      </Panel>
      <Panel aria-label="Password">
        <PanelHeader title="Password" />
        <div className="px-5 pb-5">
          <p className="pb-3 text-body text-ink-muted">Changing it signs you out of every other device.</p>
          <ChangePasswordForm />
        </div>
      </Panel>
    </div>
  );
}
