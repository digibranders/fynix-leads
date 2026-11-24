import { PageHeader } from "@/components/kit/page-header";
import type { TenantRoleName } from "@/server/db/roles";
import { getDatabase } from "@/server/db/client";
import { readOwnFynixProfile, readOwnProfile } from "@/server/domain/team";
import { ProfileView } from "./profile-view";

/** The profile page of any portal: reads the signed-in person's own member row on their own role pool, and renders the two forms. */
export async function ProfileScreen({ role, orgId, userId }: { role: TenantRoleName | "leads_fynix"; orgId: string | null; userId: string }) {
  const db = getDatabase(role).db;
  const profile = orgId === null ? await readOwnFynixProfile(db, { userId }) : await readOwnProfile(db, { orgId, userId });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Profile" description="Your name, job title and phone, and your password." />
      <ProfileView name={profile.displayName} jobTitle={profile.jobTitle} phone={profile.phone} />
    </div>
  );
}
