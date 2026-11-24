# Fynix Leads: build roadmap

Written 2026-11-24. This is the order of the whole build that follows `docs/superpowers/specs/2026-11-24-lead-flow-decision.md` and `docs/superpowers/specs/2026-11-24-meetings-and-email-decision.md`, plus every gap of the page by page audit of the same day.

It is a roadmap, not a task list. Each phase gets its own bite-sized plan in this folder, written at the start of that phase, when the owner's answers from the previous check-in exist. The first one is `2026-11-24-phase-0-repair.md`.

## How the build runs

- One phase at a time, on `development`. Each phase ends with a check-in: the owner clicks through the list under "Check-in" on the dev server and says go or change.
- `main` moves only by a PR from `development`, at the end of a phase, after the owner approves. A merge reaches `leads.fynix.digital` within a minute and runs migrations there before the build. The live site holds test data only (owner, 2026-11-24).
- Commits happen at the end of a phase, on the owner's word. No per-task commits.
- Checks per phase: lint, typecheck and the tests of the files that changed, on one worker. One `pnpm build` at the end of the phase. `pnpm test:integration` for the files touched when a phase changes `server/db`, grants or RLS.

## Rules every phase follows

1. **A new column is four changes, not one.** The schema, a hand-written grant per database role, the list in `server/db/columns.ts`, and a read path plus probe in `server/db/testing/leak-matrix.ts`. The decline bug and the red CI of 2026-11-24 were both a missing grant.
2. **Migrations are additive.** The deploy migrates before it builds, so the old process runs against the new schema for a while. A removal or a rename takes two deploys: stop using it in one phase, drop it in phase 7.
3. **`lead.stage` is text with a CHECK constraint.** Widen the constraint. Never narrow it in the phase that stops using a value.
4. **`email_template` and `campaign_status` are Postgres enums.** A value added in one migration can be used only from the next migration. `server/db/migrator.ts` runs each file in its own transaction for this reason.
5. **Timed work is idempotent and reads the clock, not the mail.** The 48 hour automatic acceptance must happen even when no email was sent. Each timer needs a unit file in the `vps-setup` repository (`fynix/leads/`), which is a separate change from this repo.
6. **A prospect email never names Fynix, the coordinator or an agency.** Until phase 6 passes its gates the portal sends only the three emails it sends today.
7. **Wording.** "Coordinator" for the supplier role, sentence case, no em dashes or en dashes, light mode only, and every new screen works on a phone.

## The phases

| Phase | Name | Needs from the owner first |
|---|---|---|
| 0 | Repair | A yes to commit the pending work, and a yes to migrate the dev database |
| 1 | Clients, coordinators and people | Nothing |
| 2 | Campaigns, the agreement and status | Nothing |
| 3 | The new lead flow | The answer on a rejection in the last 24 hours, or it ships as zero |
| 4 | The rest of the lead flow | Nothing |
| 5 | Notices and chat | Nothing |
| 6 | Meet rooms and email | The sender domain, the room account, the room test, the terms texts, and answers to the email timing points of the Meet note |
| 7 | Finish and clean up | The retention periods |

What depends on what: phase 3 needs the one number of phase 2 for its counts and the people of phase 1 for its notes. Phase 4 needs 3. Phase 5 needs the events of 3 and 4. Phase 6 needs the notices of 5 and the owner's set-up. Phases 1 and 2 could swap with each other. Phase 3 cannot move ahead of 2 without counting against two numbers.

### Phase 0: Repair

Fixes what is broken today. Small, and nothing in it depends on a decision.

- A client can reject a lead (the database refuses it today). A test covers it.
- A Fynix admin can publish terms from Settings, so invites can go out.
- Every Fynix form says "Saved" when it saves.
- The docs say the truth about deployment.

**Check-in:** reject a lead as the client on the dev server. Publish terms in Settings, then invite a person and see the invite go out. Add a client and see the saved message.
**Ships to the live site:** one migration, a grant only.
**Assumptions confirmed here:** none.

### Phase 1: Clients, coordinators and people

The owner's first complaint: the Clients screen has no edit, no contact details and no people.

- A page per client: Overview, People, Campaigns, Activity. Edit, archive and restore. A warning before a second client with the same name is added.
- Client and brand become one thing. The forms stop asking for a brand, and every screen shows the client's name. The column stays until phase 7.
- The client profile, taken when a client is added: how the client is introduced to prospects, the services offered, one key differentiating factor, marketing collateral as uploaded files and links, and case studies. Plus a time zone. Fynix edits. Fynix, the coordinator, the agencies on its campaigns and the client itself read.
- People: name, job title and email required, phone optional. Invite, resend, revoke, suspend, reactivate, rename.
- The invite form loses the "Fynix name" field. A coordinator's manager is no longer labelled "Agency" on the accept page.
- The same page for a coordinator, with its agencies. Edit and archive.
- A Team page for the client's manager, to invite colleagues. A Team page for the coordinator, to add partner agencies and invite their people. Fynix sees every invite.
- Fynix roles: admins edit set-up, staff read it and work leads. Settings can invite and suspend Fynix people.
- A profile page for everyone: change your own name and password.
- A set-up checklist on the Fynix overview: clients and coordinators with no manager, campaigns with no host, agreements not yet accepted.

Two things the phase plan must handle in `server/domain/invites.ts`: an agency invite is refused without an `alias` today (the "Fynix name"), and nobody can be invited into the Fynix organisation at all. Inviting Fynix staff also raises whether Fynix people accept terms, since `publishTermsSchema` allows a `fynix` side that no screen offers.

**Check-in:** add a client with its profile and a file. Edit it. Invite its manager, sign in as that manager and invite a colleague. As the coordinator, add an agency and invite its person. As Fynix staff, see set-up but not its edit buttons.
**Ships to the live site:** new tables for the profile and its collateral, new columns for job title, phone and time zone, their grants.
**Assumptions confirmed here:** agencies never read a client person's email or phone.

### Phase 2: Campaigns, the agreement and status

- One agreement per campaign with one number, accepted by the client and by the coordinator. The coordinator's separate target goes from every screen. Shares are measured against the one number.
- A campaign can be made active only when both have accepted and it has at least one host. The refusal says which of the two is missing. The agency's lead form names the real reason when its campaign is not active.
- Three states shown to people: Setting up, Active, Closed. The screen by screen list is in the lead flow note, section "Campaign status on every screen": tabs on every campaign list, a campaign filter and a Closed tag on leads and meetings, a campaign column on the client's leads, active-only totals on every overview, and split counts on the clients and coordinators tables.
- Close and reopen a campaign. A closed campaign is read only.
- The client reads its own campaign brief. Agreement history. A confirm step before accepting an agreement and before removing a share.
- Hosts: the client adds and pauses a host, and a host edits their own hours and blocked times.
- Inside a Fynix campaign: Leads, Meetings and Activity tabs. The recorded history becomes readable.
- An alias picks its client from a list, and can be edited and retired.

**Check-in:** try to make a campaign active with no host and read the refusal. Accept the agreement as both sides, add a host, make it active. Close it and see it leave every default list. Filter leads by campaign.
**Ships to the live site:** acceptance columns for the single agreement, new tables only where needed. The supplier agreement rows stay until phase 7.
**Assumptions confirmed here:** a closed campaign is read only and leads already submitted finish their course. The old agreement version stays in force until both accept the new one.

### Phase 3: The new lead flow

The centre of the product. Replaces "accept, hold, deliver, dispute" with "schedule, hold, outcome, client decides".

- Picking a time schedules the meeting and nothing else. The client can propose other times.
- The client can reject at any time before the meeting, with a required note.
- The client, the agency, the coordinator and Fynix can each record the outcome. The first one sets it.
- After "meeting finished" the client accepts or rejects, with a required note both ways.
- Accepted counts one, in the month the meeting was held, read in the campaign's time zone. Rejected counts zero. A client no-show counts one at once. A prospect no-show closes the lead at zero.
- With no answer 48 hours after the outcome, the lead is accepted by a scheduled job.
- Fynix sees every rejection with its note and can change it to accepted, with its own note. The Disputes page becomes the Rejections page. Filing a dispute leaves the screens.
- A lead record in all four portals: a row opens it. Details, qualification answers, history, notes. The supply side sees the client's note as from "Client".
- The Availability screen shows the host, the alias, the campaign and the host's time zone, and asks before it saves.
- Every count in the app follows the new rule: overviews, campaign cards, shares, "Delivered in November".

**Check-in:** submit a lead, pick a time, record "finished" as the agency, accept as the client with a note and see the count move. Repeat with a rejection and see zero. Record a client no-show and see one. Change a rejection as Fynix.
**Ships to the live site:** a wider stage check, new columns for the client's answer and note, grants, and a timer unit in `vps-setup`.
**Owner decision needed:** a rejection less than 24 hours before the meeting. The rule lives in one function. Until the owner answers it returns zero, the same as any early rejection.
**Assumptions confirmed here:** the note shows as from "Client". An automatic acceptance carries the note "Accepted automatically after 48 hours with no answer". A client no-show counts at once.

### Phase 4: The rest of the lead flow

- Drafts: an agency saves a lead and finishes it later. Only its own company sees it.
- Postponing: either side proposes one to three new times and the other picks one.
- Contesting an outcome inside 48 hours, with a note. Fynix decides.
- The coordinator asks Fynix to review a rejection, with a note, inside 48 hours. Fynix gets a list.
- An agency withdraws a lead before the meeting.
- Fynix acts on a lead: correct it, answer for the client with a note, record an outcome, mark it lost, decide a lead beyond a share.
- The lead form: the host's free hours, a second time zone, a warning outside working hours, host names, and a time list that follows the host's hours.
- Tables: sorting, a host column, a source agency column for Fynix, the agency named on a coordinator's row, and exports.
- The exclusion list for clients.

**Check-in:** save a draft and submit it later. Postpone a meeting from each side. Contest an outcome and decide it as Fynix. Ask for a review of a rejection.
**Ships to the live site:** columns and tables for drafts, postponements, contests and review requests.
**Assumptions confirmed here:** none new.

### Phase 5: Notices and chat

- A notification bell in the top bar, and a notice in the app for every event in the "Emails at launch" table of the Meet note.
- The reminders to the client every 12 hours after the outcome, at 12, 24 and 36 hours, in the app. The email half follows in phase 6.
- Unread counts on Messages and Inbox.
- Chat groups limited to one hop: client with Fynix, Fynix with coordinator, coordinator with its agencies. `app_group_candidates()` is narrowed, and any group that already mixes sides is listed for the owner.
- Fynix Inbox threads carry the company's name. A client can start a thread. A thread per lead, linked both ways.
- Search finds a lead, a person and a company. Figure cards on every overview link to the table behind them. Upcoming meetings get a Join button.

**Check-in:** record an outcome and see the client's bell. Leave it and see the reminders arrive on the scheduled job. Try to add a client person to a coordinator group and be refused.
**Ships to the live site:** a function change for group candidates, and columns only if the notification table needs them.
**Assumptions confirmed here:** a reminder goes to every person at the client who can answer for the campaign, and one answer stops the rest.

### Phase 6: Meet rooms and email

Everything under "What would then need building" in the Meet note. It cannot start until the owner has done steps 1 to 5 of "What the owner arranges, in order" there.

- A short developer session first, for items 4, 5, 7 and 8 of the room test.
- A Meet room made when the client picks a time, kept through every postponement.
- The join record after the meeting: name, join time and length of stay, beside the outcome for all four parties.
- The sender on the neutral domain, a sender name per message, a reply address and attachments.
- A template per audience and event, the privacy line, and the calendar file made on the server.
- Reminders to the prospect, outcome nudges, and the email half of the client's 12 hour reminders.
- A privacy link per campaign, and a switch that keeps prospect email off until the link is set and the gates have passed.

**Check-in:** the owner's own gates G3 and G4 in the Meet note.
**Ships to the live site:** new enum values for templates, columns for the room and the join record, a privacy link column, timer units in `vps-setup`.
**Assumptions confirmed here:** none. The Meet note's open points must be answered before this phase is planned.

### Phase 7: Finish and clean up

- A second sign-in step for Fynix users (gate G1).
- Screens for the audit log and for editing email templates.
- The second deploy of every removal: `organisation.brand_name`, `campaign.client_brand_name`, the supplier agreement rows, the old lead stages and the unused campaign states.
- Retention of the join record and of a closed lead's prospect details, once the owner gives the periods.
- A pass over what the audit could not cover: a read-only member, a brand new company with no data, file uploads with the virus scanner, and every flow on a phone.

**Check-in:** sign in to Fynix with the second step. A full run of the main chain on the live site.
**Ships to the live site:** the drops. They are the only non-additive migrations of the build.

## Coverage

Every decision and every audit gap, with the phase that closes it. A row with no phase would be a miss.

### Decisions

| Decision | Phase |
|---|---|
| Role name "coordinator" | Done on 2026-11-24, uncommitted |
| Note required on accept and on reject | 3 |
| Automatic acceptance after 48 hours | 3 |
| Client no-show counts as one | 3 |
| Prospect no-show closes the lead at zero | 3 |
| Fynix can change a rejection to accepted | 3 |
| Reject at any time before the meeting | 3, and 0 for the bug |
| Four parties can record the outcome | 3 |
| Contest a wrong outcome | 4 |
| Counting by the month of the meeting | 3 |
| One number per campaign, one agreement | 2 |
| Chat groups one hop only | 5 |
| Client manager invites colleagues | 1 |
| Coordinator adds agencies and invites their people | 1 |
| Fynix admins and staff | 1 |
| Person details | 1 |
| Client profile, access and collateral | 1 |
| Client meeting emails, with a switch per person | 6, the switch in 1 |
| Client and brand are the same | 1, the drop in 7 |
| Time zone on a company | 1 |
| Postponing | 4 |
| Review of a rejection inside 48 hours | 4 |
| No Fynix check before the client | Nothing to build. The flow already works this way |
| Going live needs the agreement and a host | 2 |
| Drafts | 4 |
| Terms texts from the owner, a publish screen | 0 |
| Campaign status on every screen, three states | 2 |
| Reminders to the client every 12 hours | 5 in the app, 6 by email |
| Meet rooms, join record, sender domain, launch emails, privacy line | 6 |
| A rejection in the last 24 hours | Open. One function in 3 |

### Audit gaps

| Gap | Phase |
|---|---|
| Client cannot decline | 0 |
| Dev database one migration behind | 0, with the owner's yes |
| No screen publishes terms | 0 |
| Most saves say nothing | 0 for Fynix forms, each later phase for its own forms |
| Docs say the app is not deployed | 0 |
| Second target shown to the coordinator | 2 |
| A group can mix the client side and the supply side | 5 |
| A 5 am meeting accepted with no warning | 4 |
| No notifications, no lead emails | 5 and 6 |
| Two clients with the same name | 1 |
| Figure cards are not links, latest leads do not open | 5 for the cards, 3 for the rows |
| No way to look at one campaign | 2 |
| Outcome due card shown to the client | 3. The client may record an outcome now, so the card stays and is reworded |
| No way to propose other times | 3 |
| Accept with no confirm step | 3 |
| Lead shows no host, alias, campaign or prospect contact | 3 |
| Decline reason from a list that Fynix keeps | Dropped. The owner chose a typed note |
| Host's time zone not shown | 3 |
| A row opens nothing, in every portal | 3 |
| No host column, sorting or export | 4 |
| A declined lead does not show its reason | 3 |
| Meet link never created, no meeting email | 6 |
| A meeting cannot be moved or cancelled | 4 |
| No attendance, no meeting page | 6 for attendance. The lead record of 3 carries the meeting |
| Client cannot start a thread, no thread per lead | 5 |
| No unread count | 5 |
| Client cannot read its campaign brief | 2 |
| Draft campaigns show as running | 2 |
| Client cannot add or pause a host, hours not editable | 2 |
| A host must already have an account | 1, through the client's Team page |
| No agreement history, instant accept, no email on a new version | 2, the email in 6 |
| Team page, exclusion list, notification centre, profile page | 1, 4, 5, 1 |
| Partner agency not named on a coordinator's row | 4 |
| No withdraw | 4 |
| Reschedule after a prospect no-show | Dropped. A prospect no-show closes the lead and the agency submits a new one |
| Host shown as "Host" with no name | 4 |
| No draft | 4 |
| Coordinator cannot add an agency or invite its people | 1 |
| Alias brand typed by hand, alias cannot be edited or retired | 2 |
| Agency form gives the wrong reason for a draft campaign | 2 |
| Fynix overview: per campaign view, split by agency, oldest waiting, overdue outcomes | 2 for the campaign view, 4 for the rest |
| Set-up checklist | 1 |
| Fynix has no actions on a lead | 4 |
| Fynix cannot record an outcome | 3 |
| Inbox threads named by kind, not company | 5 |
| Dispute reason list, no link to the lead | Dropped with disputes. The Rejections page of 3 links to the lead |
| No client page, edit, archive, people, invite, contact details | 1 |
| "Fynix name" on the invite form | 1 |
| Coordinator cannot be edited or archived, people have no actions | 1 |
| Nothing checks hosts and agreements before a campaign goes active | 2 |
| Removing a share with no confirm | 2 |
| "Delivered in November" says not counted yet | 3 |
| Campaign Activity not built | 2 |
| Settings cannot add staff | 1 |
| Reason lists in Settings | Dropped with the typed note |
| Templates, audit log | 7 |
| Leads and Meetings tabs inside a campaign | 2 |
| No second factor for Fynix | 7 |
| A coordinator manager labelled "Agency" on the accept page | 1 |
| Search finds pages only | 5 |
| Not covered by the audit: read-only member, empty company, uploads, phone, exports | 7, exports in 4 |

## Open with the owner

- A rejection less than 24 hours before the meeting.
- The sender domain's name, the sender address and the Workspace plan.
- Whether "lead submitted" emails go at once or every 2 hours, and when outcome nudges go out.
- Whether the client is emailed on an automatic acceptance, on a rejection Fynix changed, and on a client no-show.
- Which host the prospect letter names when several are invited.
- How long the join record and a closed lead's prospect details are kept.
