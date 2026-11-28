# Fynix Leads project context

Fynix Leads is the operations portal for managed B2B lead generation. Fynix sets up campaigns and oversees delivery. Coordinators and partner agencies source prospects, submit leads and arrange meetings. Clients provide the people who take those meetings and decide whether a held meeting qualifies. The portal tracks those decisions against campaign targets while keeping the two sides' private information scoped to their organisations.

Use this map to find the entry point for a change. The linked implementation, tests and latest applicable database migrations establish current behavior. The original product specs and some notes in the README and CLAUDE.md describe earlier phases.

## Portals and request flow

| Portal | Who uses it and what they do | Entry point |
| --- | --- | --- |
| Fynix | Managers run setup, including clients, coordinators, agencies, campaigns, agreements and shares. Staff can read setup and perform permitted lead operations. Fynix sees cross-tenant pipeline, meetings, inbox, disputes and rejection reviews. | [Fynix routes](../app/(fynix)/fynix), [session guard](../server/fynix/session.ts), [setup actions](../server/fynix/actions.ts), [lead actions](../server/fynix/lead-actions.ts) |
| Client | Reviews leads, responds to meeting invitations, records outcomes and decisions, manages exclusions, team and working hours. | [Client routes](../app/(client)/client), [session guard](../server/client/session.ts) |
| Coordinator | Runs the supply side of a campaign, works with partner agencies and can submit its own leads. | [Coordinator routes](../app/(coordinator)/coordinator), [session guard](../server/coordinator/session.ts) |
| Agency | Works on campaigns shared with it. Submits leads and manages its own pipeline, meetings and messages. | [Agency routes](../app/(agency)/agency), [session guard](../server/agency/session.ts) |

- [Welcome](../app/(app)/welcome/page.tsx) routes signed-in users by organisation kind and agency hierarchy. A coordinator is a top-level agency in the data model, and a partner agency belongs to one coordinator. Use “Coordinator” in visible copy. [Next redirects](../next.config.ts) keep the old supplier URLs working.
- Next.js App Router pages authenticate at the page boundary and call role-shaped server loaders. Actions validate input with domain Zod schemas, call the owning service and revalidate affected pages. Follow [tenant form handling](../server/tenant/run-form.ts) and [Fynix action handling](../server/fynix/run-action.ts). [Domain dependencies](../server/domain/deps.ts) give services their clock, database and integration dependencies.
- Pure business rules and presentation helpers belong in [lib](../lib). [Components](../components) render their results. Next.js 16 uses Cache Components and async route params. [AGENTS.md](../AGENTS.md) points to the locally installed Next.js guides.

## Workflows and their owners

| Area | Current behavior | Start here |
| --- | --- | --- |
| Accounts, terms and people | Better Auth sessions require active membership. Account creation happens through admin bootstrap or invitation redemption. Redemption ties account, membership and terms acceptance together. Fynix TOTP enforcement is gated. | [Auth](../server/auth), [invites](../server/domain/invites.ts), [redemption](../server/domain/redeem-invite.ts), [team actions](../server/domain/team-actions.ts), [terms](../server/domain/terms.ts) |
| Campaign setup | A client campaign is assigned to a coordinator, with optional shares. Going live requires agreement acceptance by both sides and an active client team member. Setup, active and closed are the user-facing buckets. Closed campaigns are read-only until reopened. | [Campaigns](../server/domain/campaigns.ts), [go-live and open checks](../server/domain/campaign-rules.ts), [status and tabs](../lib/campaign-status.ts), [agreements](../server/domain/agreements.ts), [shares](../server/domain/shares.ts) |
| Campaign brief and qualification | Target titles, industries, market and qualifying questions feed the submission checklist. New submissions snapshot the checks with the lead. Each question records what the prospect said and whether it met expectations. Older snapshots may lack answers. | [Qualifying items](../lib/qualifying-items.ts), [qualification rules](../lib/qualification-checks.ts), [submission form](../components/leads/submit-lead-form.tsx), [checklist display](../components/leads/qualification-checklist-view.tsx), [input schemas](../server/domain/inputs.ts) |
| Draft and submit | The coordinator or assigned agency can save a draft and submit it later. A successful send replaces the form in browser history with the portal's All Leads page. Opening a new form starts with fresh values. Submission checks the active assignment, team member, exclusions and duplicates, and flags over-share leads for Fynix. New submission screens use one slot and invitees. Existing multi-time proposals still have a domain path. Alias selection was removed from the form. | [Submission action](../server/domain/lead-actions.ts), [lead service](../server/domain/leads.ts), [draft service](../server/domain/lead-drafts.ts), [form data](../server/domain/lead-form-data.ts) |
| Book and move | An active member of the client can take meetings for any of that client's campaigns. Availability combines working hours, blocks and busy time, with 48 hours of booking notice. A lead waits at `awaiting_reply` until the first invitation acceptance schedules it. If no one accepts and the invitations run out, it goes to `reschedule_needed`. Rebooking reuses the meeting and calendar identity. | [Slot picker](../components/leads/slot-picker.tsx), [free-time rules](../lib/calendar/free-time.ts), [default hours](../lib/leads/host-hours.ts), [team availability](../server/domain/team-availability.ts), [booking and replies](../server/domain/meeting-invitations.ts), [reply links](../server/domain/invitation-links.ts) |
| Outcome and decision | A held meeting moves into client decision. The sweep can accept after 48 hours. Fynix resolves contested outcomes and can overturn rejections. Existing rows can carry legacy stages. | [Meeting outcomes](../server/domain/meetings.ts), [lead decision actions](../server/domain/lead-flow-actions.ts), [client queue](../server/domain/client-queue.ts), [stages](../lib/leads/stage.ts), [action eligibility](../lib/leads/lead-actions.ts), [contests](../server/domain/contests.ts), [rejection reviews](../server/domain/rejection-reviews.ts) |
| Delivery and reporting | Accepted leads, legacy delivered leads and client no-shows count in the meeting month in the campaign's time zone. Late pre-meeting rejection currently counts zero. Submission over-share is a separate check. | [Counting rules](../lib/domain/counting-month.ts), [meeting counts](../lib/meetings/counting.ts), [analytics](../server/domain/analytics.ts), [lead records](../server/domain/lead-record.ts), [CSV reads](../server/domain/export-reads.ts) |
| Calendar and Meet | Each portal has calendar and meeting views. Connections can show a member's own Google or Outlook events. Only client members' busy spans sync into scheduling. Meet rooms come from the real provider when enabled. The meeting link may be empty. | [Calendar page data](../server/domain/calendar-data.ts), [calendar UI](../components/calendar), [calendar integrations](../server/calendar), [OAuth routes](../app/api/calendar), [Meet provider](../server/meet), [ICS identity](../lib/meetings/uid.ts) |
| Messaging and notices | Audience and thread membership determine which messages, attachments and groups are visible. Domain events create in-app notices and can enqueue email. Search and exports are scoped to the viewer. | [Messages](../server/domain/messaging.ts), [message reads](../server/domain/messaging-reads.ts), [groups](../server/domain/groups.ts), [attachment route](../app/api/attachments/[id]/route.ts), [search](../server/domain/search.ts), [notices](../server/domain/notices.ts), [notice catalogue](../lib/leads/notices.ts) |
| Mail and scheduled work | Mail is queued in a transactional outbox before Brevo delivery. Prospect letters for submissions without an alias use the client's name. The lead sweep handles automatic acceptance, invitation expiry, reminders and enabled calendar and Meet work. | [Mail services](../server/mail), [templates](../lib/email/launch-templates.ts), [client-name letter migration](../server/db/migrations/0117_prospect_letter_client_name.sql), [outbox job](../scripts/outbox-run.ts), [lead sweep](../scripts/leads-sweep.ts) |

## Boundaries that affect changes

- PostgreSQL 16 enforces row and column access. [Role pools](../server/db/pool.ts) and [scoped transactions](../server/db/scope.ts) establish the actor. Start tenant reads with the explicit projections in [columns.ts](../server/db/columns.ts) and [tenant-reads.ts](../server/db/tenant-reads.ts), and follow the role grants, RLS and invoker-view rules in [CLAUDE.md](../CLAUDE.md).
- Client-facing payloads omit the source agency's identity. Supply-side scheduling can expose the client team member's name, working-time information and permitted meeting data. Private contact details and calendar event titles stay scoped. Check the [leak matrix](../server/db/testing/leak-matrix.ts) when adding or widening a read path.
- [Fynix writes](../server/domain/fynix-write.ts) distinguish admin setup from permitted staff lead work. Domain mutations that require auditing write the audit entry in the same transaction. Lead stage history also has its own [schema](../server/db/schema/lead-history.ts).
- [Schema](../server/db/schema) and [migrations](../server/db/migrations) must agree. Deployed migrations are immutable. A schema change can also require a grant, an RLS policy, a projection and coverage in the [structural tests](../server/db/structure.integration.test.ts).
- [DESIGN.md](../DESIGN.md) owns Ledger Soft, including layout, typography, responsive behavior and copy. The shared shell is in [components/shell](../components/shell), and shadcn primitives are in [components/ui](../components/ui). The project uses Base UI and Phosphor. Use “client team member” in UI copy where legacy code says “host.”

## Verification and operations

- Graphify indexes the TypeScript in `server/domain`, including its tests. Use it from the repo root to find callers and dependencies, then check the relevant source before editing. The graph covers domain code and resolves paths relative to `server/domain`. UI, the database schema and SQL migrations are outside its scope and are mapped above. Generated output is local and git-ignored.

  ```sh
  graphify explain submitLead
  graphify query "lead submission booking notices" --budget 800
  ```

  Refresh the local graph after domain changes. These commands use one extraction worker and skip remote semantic extraction and labeling.

  ```sh
  graphify extract server/domain --code-only --max-workers 1 --out .
  graphify cluster-only . --no-label
  ```

- Node 24 and pnpm run this application. [package.json](../package.json) lists commands. The [unit config](../vitest.config.mts) excludes integration tests. The [integration config](../vitest.integration.config.mts) uses a dedicated test database and runs files serially. Domain suites include [lead flow](../server/domain/lead-flow.integration.test.ts), [invitations](../server/domain/meeting-invitations.integration.test.ts), [tenant flows](../server/domain/tenant-flows.integration.test.ts) and [calendar sync](../server/calendar/sync.integration.test.ts).
- The [CI workflow](../.github/workflows/ci.yml) defines the full application and database checks. Follow the workspace's machine-load limits for local runs.
- [Deployment](deploy.md), the [launch checklist](launch-checklist.md) and the [owner checklist](owner-checklist.md) cover environment setup, scheduled jobs and rollout gates. Check [environment validation](../server/env.ts) and the owning service for feature switches. Repository defaults and checklists describe the implementation and rollout plan. Live settings require separate verification.

When changing the project, update the affected section here in the same change. If a workflow moves, replace its file references. Record current behavior and keep detailed decisions in the owning tests or specs.
