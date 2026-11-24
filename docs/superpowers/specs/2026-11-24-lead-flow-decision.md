# Lead flow and product decisions: the client decides after the meeting

Owner decision, 2026-11-24. This replaces sections 8.2 to 8.4 of `2026-11-12-leadgen-portal-design-v2.md` where they differ. It is a decision record, not yet built.

## The flow

1. **Draft.** The agency or the coordinator prepares a lead.
2. **To schedule.** The lead is submitted. The client picks one of the proposed times. Picking a time only schedules the meeting. It does not accept the lead.
3. **Scheduled.** The meeting can be postponed to a new time, as often as needed. The client can also reject the lead here, with a note.
4. **Outcome.** After the meeting the agency or the coordinator records what happened: finished, prospect no-show or client no-show.
5. **Client decides.** The client accepts or rejects the lead. A note is required for both answers.
6. **Accepted** counts as one. **Rejected** counts as zero.

## Rules

| Rule | Decision |
|---|---|
| Note | Required when the client accepts and when it rejects, before and after the meeting |
| No answer | 48 hours after the outcome is recorded with no answer, the lead is accepted and counts as one |
| Client no-show | Counts as one, with no client decision needed |
| Prospect no-show | The lead closes and counts as zero. The agency submits a new lead to try again |
| Challenge | Fynix sees every rejection with its note and can change it to accepted, with its own note |
| Early reject | The client can reject at any time before the meeting, with a note. It counts as zero |
| Recording the outcome | The client, the agency, the coordinator and Fynix. Whoever records first sets it |
| A wrong outcome | The other side has 48 hours to contest it with a note. A contested outcome goes to Fynix, who decides |
| Counting | Only an accepted lead adds one, in the month its meeting was held, read in the campaign's time zone |

## Other decisions of the same day

| Topic | Decision |
|---|---|
| Role name | The supplier is called the coordinator in everything a person reads |
| Targets | One number per campaign, from the client. There is no separate coordinator target |
| Agreements | One agreement per campaign, accepted by the client and by the coordinator. Agency shares split its number |
| Chat groups | One hop only: client with Fynix, Fynix with coordinator, or coordinator with its agencies. The client and the supply side never share a chat |
| Client team | Fynix invites the first manager. The client's manager can then invite colleagues, and Fynix still can |
| Agencies | The coordinator adds its own partner agencies and invites their people. Fynix can too and sees every invite |
| Fynix roles | Admins edit set-up. Staff read it and work leads, meetings, messages and rejections |
| Person details | Name, job title and email required. Phone optional |
| Client profile | Taken when a client is added: how the client is introduced to prospects, the services offered, one key differentiating factor, marketing collateral, and case studies if any |
| Profile access | Fynix, the coordinator and the agencies read it. The client reads its own. Only Fynix edits |
| Collateral | Uploaded files and links |
| Client meeting emails | Every active client person, with a switch per person |
| Client and brand | The same thing. A client, for example Upwind, has one name and its own people. There is no separate brand name |
| Extra company fields | A time zone, and nothing else beside the profile |
| Postponing | Either side proposes one to three new times and the other side picks one. No limit |
| Review of a rejection | The coordinator presses a button on the rejected lead and types a note, within 48 hours of the rejection. Fynix sees it in a list |
| Fynix check | None. A lead goes straight to the client. Fynix sees every lead and can step in |
| Going live | A campaign can be made active only when the client and the coordinator have both accepted its agreement and it has at least one host |
| Drafts | An agency can save a lead as a draft. Only its own company sees it until it is submitted |
| Terms | The owner supplies the real texts. Fynix gets a screen to publish them |
| Build size | Everything from the audit and these decisions, in phases, with a check-in after each phase |
| Reminders to the client after the meeting | From the moment the outcome "meeting finished" is recorded, the client is reminded every 12 hours until it accepts or rejects: at 12, 24 and 36 hours, each stating the time left. At 48 hours the lead is accepted automatically. Reminders stop on the answer. Assumed: in the app and by email, to every client person who can answer for the campaign |

## What changes against the current build

- Accepting a time no longer accepts the lead. Today `clientReviewLead` moves the lead to `scheduled` and the client can never decline after that.
- A lead no longer counts when the meeting is held. Today `delivered` follows the outcome directly.
- The 48 hour dispute and Fynix's dispute decision are replaced by the client's accept or reject, by Fynix overturning a rejection, and by contesting an outcome.
- The two agreements with two targets become one agreement with one number. Today `agreement` has a party per row and the coordinator's can differ from the client's.
- Chat groups must be limited to one hop. Today `app_group_candidates()` lets a Fynix manager add anyone.
- A note is added to accept. Today only decline carries a reason.
- Postponing is new, and a prospect no-show must close the lead. Today it leaves the lead in a stage nobody can act on.
- Rejecting before the meeting exists as decline but fails: `leads_client` has no UPDATE grant on `lead.closed_at`.
- A scheduled job is needed for the 48 hour auto-accept.

## Campaign status on every screen

The owner: a campaign is active or closed, every place that shows a campaign must say which, and lists need a filter where they mix the two.

The enum has five values (`draft`, `active`, `paused`, `completed`, `archived`). Shown to people they become three: Setting up (`draft`), Active, Closed (`paused`, `completed`, `archived`). The owner confirmed the three states on 2026-11-24. Whether to collapse the enum itself is a build decision. Every list opens on Active.

| Screen | Today | Change |
|---|---|---|
| Fynix campaigns list | Status column, search only | Tabs with counts: Active, Setting up, Closed, All |
| Fynix campaign detail | Status beside the name | Close and Reopen actions, a closed line with the date |
| Fynix clients and coordinators tables | One campaign count | Split into active and closed |
| Fynix overview | "Active campaigns 1 of 5", totals sum every campaign | Totals count active campaigns only |
| Fynix leads and meetings | Campaign column, no filter | Campaign filter (active first, closed grouped), Closed tag on rows |
| Client campaigns | Cards with status, no filter | Active first, Closed in its own tab |
| Client overview | No campaign named, sums all | Active only, a switcher with more than one active campaign |
| Client leads | No campaign column | Add the column and the filter |
| Client meetings | Campaign column, no filter | Filter and Closed tag |
| Client hosts and agreement | One block per campaign | Active first, closed folded and read only |
| Coordinator and agency campaigns | Cards with status, no filter | Same tabs; assign, take back and shares only on active |
| Coordinator and agency leads and meetings | Campaign column, no filter | Filter and Closed tag |
| Submit a lead | Picker already lists active only (`lead-reads.ts`) | No change |
| Messages and Fynix inbox | Thread carries the campaign name | Closed tag in the thread header |
| Search palette | Finds campaigns | Status beside each result |

Assumed: a closed campaign is read only (no new leads, no share changes) and leads already submitted finish their course. Fynix can reopen a closed campaign.

## Still open

- A rejection less than 24 hours before the meeting: to do, the owner is discussing it with his team. The choices are a client no-show that counts as one, zero as for any early reject, or a decision by Fynix.
- Meet rooms and portal email are decided in `2026-11-24-meetings-and-email-decision.md`. Its own "Still open" list carries what is left: the sender domain's name and address, the Workspace plan, email timing, and three client emails.

The owner asked for every decision to be noted first and for all changes to be built together at the end.

## Assumed unless the owner says otherwise

- The client's note on accept or reject shows to the agency and the coordinator as from "Client". Fynix sees the person's name.
- An automatic acceptance is recorded with the note "Accepted automatically after 48 hours with no answer".
- A client no-show counts at once. If the client contests it and Fynix agrees, the count is removed.
- When a new agreement version is published, the old one stays in force until both sides accept the new one.
- A second factor for Fynix users is left for a later round.

## The live site

`leads.fynix.digital` is live on the Firstfold VPS. A timer deploys `main` within a minute of any merge and runs migrations before the build (`FirstFold/vps-setup/fynix/leads/`). The owner confirmed on 2026-11-24 that it holds test data only. `docs/deploy.md` and `CLAUDE.md` in this repo still say nothing is automated: correct them in the build. Merge to `main` only at the end of a phase, after the owner approves.

## Notes for the build

- "Client and brand are the same" removes `organisation.brand_name` as a separate idea. Today the supply side sees the brand and only Fynix and the client see the name, and `campaign.client_brand_name` is a copy kept by a trigger. The single name becomes what everyone sees. Plan this as an additive change: stop asking for a brand, show the name, and retire the column in a later deploy.
- An alias identity's "client brand" becomes the client, picked from a list, not typed.
