/**
 * The six login roles, one connection pool per role, and the names of the environment variables that carry their
 * passwords and connection strings. Plain data with no imports, so scripts, tests and app code can all read it.
 * The role purposes are in docs/superpowers/plans/2026-11-11-phase-1-accounts-and-campaigns.md, section 3.
 */
export const ROLE_NAMES = ["leads_owner", "leads_auth", "leads_fynix", "leads_client", "leads_agency", "leads_public"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

/** Roles the running app connects as. `leads_owner` is for migrations and never opens a runtime pool. */
export const RUNTIME_ROLES = ["leads_auth", "leads_fynix", "leads_client", "leads_agency", "leads_public"] as const;
export type RuntimeRoleName = (typeof RUNTIME_ROLES)[number];

/** Roles that only ever see their own organisation's rows, through column grants and row-level security. */
export const TENANT_ROLES = ["leads_client", "leads_agency"] as const;
export type TenantRoleName = (typeof TENANT_ROLES)[number];

export const OWNER_ROLE = "leads_owner";

export const DATABASES = { dev: "fynix_leads", test: "fynix_leads_test" } as const;
export type DatabaseTarget = keyof typeof DATABASES;

const SUFFIX = {
  leads_owner: "OWNER",
  leads_auth: "AUTH",
  leads_fynix: "FYNIX",
  leads_client: "CLIENT",
  leads_agency: "AGENCY",
  leads_public: "PUBLIC",
} as const satisfies Record<RoleName, string>;

export type RoleUrlVariable<R extends RoleName> = `DATABASE_URL_${(typeof SUFFIX)[R]}`;
export type RoleTestUrlVariable<R extends RoleName> = `DATABASE_URL_${(typeof SUFFIX)[R]}_TEST`;
export type RolePasswordVariable<R extends RoleName> = `LEADS_${(typeof SUFFIX)[R]}_PASSWORD`;

/** `DATABASE_URL_CLIENT` for the dev database, `DATABASE_URL_CLIENT_TEST` for the test one. */
export function urlVariable<R extends RoleName>(role: R, target: "dev"): RoleUrlVariable<R>;
export function urlVariable<R extends RoleName>(role: R, target: "test"): RoleTestUrlVariable<R>;
export function urlVariable(role: RoleName, target: DatabaseTarget): string {
  return target === "dev" ? `DATABASE_URL_${SUFFIX[role]}` : `DATABASE_URL_${SUFFIX[role]}_TEST`;
}

export function passwordVariable<R extends RoleName>(role: R): RolePasswordVariable<R> {
  return `LEADS_${SUFFIX[role]}_PASSWORD` as RolePasswordVariable<R>;
}
