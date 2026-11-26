# Fynix Leads: calendar, one-slot booking and calendar connection

Owner decisions of 2026-11-26. Nothing here is built. The visual is the working mock in `docs/superpowers/specs/calendar-comps/calendar-sync-plan.html` (month, week and day views, three roles, and the architecture and workflow diagrams).

This is the one calendar spec. It replaces `2026-11-23-calendar-design.md`, which stays in the folder as history. Section 15 lists what is carried over from that draft and what is dropped.

## 1. Purpose

An agency agrees a time with a prospect and needs to know, at that moment, which people at the client are free. Today it cannot: a lead names one host, the agency proposes up to three times, and the client picks one later.

This spec gives every role a calendar, lets client team members connect Google or Outlook so real busy time is known, and turns booking into one step: the agency picks one free slot, the free client team members are invited, and the first one to accept confirms the meeting.

## 2. Owner decisions

| Topic | Decision |
|---|---|
| Booking | One time slot per booking. The agency no longer proposes one to three times and the client no longer picks one. |
| Client team members | There is no host concept. Every person added to a client can be invited to, accept and attend meetings, for every campaign of that client. |
| Logins | Every person added to a client gets a portal login. There is no separate list of contacts without a login. |
| Accepting | An Accept or Decline button, in the invitation email and in the portal. Pressing Yes inside Google or Outlook does not count. |
| Calendar accounts | Google (Workspace and Gmail), Microsoft 365, and personal Outlook.com. |
| Views | Month, week and day. |
| What others see | Free or busy per person, by name. Never why a person is busy. |
| Own calendar | A signed-in client team member sees their own Google or Outlook events with titles, including events that have nothing to do with the portal. |
| Agency reach | An agency sees only the clients it has a campaign with. Fynix sees every client and every agency. |
| Meeting link | Whoever may be in the meeting sees the link on the calendar. |

The nine defaults the owner approved the same day:

1. A busy slot cannot be picked. Today the lead form only warns.
2. A person with no connected calendar is judged on typed hours and blocked times alone.
3. Every client team member free at the chosen time is invited. The agency can untick people, but not all of them.
4. The first Accept confirms the meeting. The other invited people are released and can still join.
5. If nobody presses Accept by 24 hours before the meeting, the lead moves to Reschedule needed, and the agency, the coordinator and Fynix are told.
6. The prospect's confirmation letter goes out on the first Accept, not at the invitation.
7. The meeting link stays a Google Meet room from the neutral account, for Outlook clients too. No Teams.
8. Postponing uses the same one-slot picker.
9. A client team member's own event titles are read live, shown to that person alone, and never stored.

## 3. What this replaces

| Document | Part | What changes |
|---|---|---|
| `2026-11-24-lead-flow-decision.md` | Flow step 2, "the client picks one of the proposed times" | The agency picks one slot. A client team member accepts the invitation. |
| Same | "Postponing: either side proposes one to three new times" | Either side picks one new free slot. The people free then are invited again. |
| Same | "Going live: at least one host" | At least one active client team member. |
| `2026-11-24-meetings-and-email-decision.md` | Email table rows "Lead submitted", "Client proposed other times", "Time picked" | Section 10 of this spec. `lib/leads/lead-emails.ts` is tested against that table, so the test changes with it. |
| Same | "Still open: which host is named in the prospect letter" | Open decision 12 here. |
| `2026-11-12-leadgen-portal-design-v2.md` | Section 7.3 and D18, "hosts type their hours, calendar connection later" | No hosts. Calendar connection is built now. Typed hours stay as the fallback. |
| `2026-11-23-calendar-design.md` | All of it | This spec. |
| `docs/superpowers/plans/2026-11-24-build-roadmap.md` | No calendar phase exists | Section 14 here is the build order. The roadmap gets a calendar phase when the owner schedules it. |

Unchanged: the client rejecting a lead before the meeting, recording an outcome, the client's decision after the meeting, the 48 hour automatic acceptance, counting, contests, review of a rejection, and the join record.

## 4. People: one kind of client team member

Today the app has three things: a client contact (a name Fynix keeps, no login), a member (a person with a login) and a campaign host (a member marked as taking meetings for one campaign). After this change there is one: a member of the client.

- **Who can be invited:** every member of the client with `member.status = 'active'`, for every campaign of that client.
- **Hours:** each person keeps their own weekly hours and blocked times (`host_hours`, `host_block`). These tables already hang off a member, so they stay, with their names.
- **Going live:** the rule "at least one host" becomes "at least one active client team member". The refusal wording changes with it.
- **Lead form:** in step B the agency still chooses one person on the lead, now from every active client team member. The chooser goes in step E, when the slot picker decides who is invited.
- **Hours screens:** `/client/hosts` becomes `/client/hours` (Working hours) and lists every active team member. The campaign's Hosts tab becomes the Client team tab. Adding and pausing a host go. Editing hours and blocked times stays where it is.
- **Wording:** no screen, email or error says "host". The words are "client team member" and "client team".

What it touches in the code and the database:

| Item | Change |
|---|---|
| `campaign_host` table, `server/domain/hosts.ts`, `hosts-tenant.ts` | No longer read or written. The table stays until clean-up. |
| `app_campaign_host_names(campaign)` | Left in place, unused. A new function, `app_campaign_team`, returns the name and client time zone of every active person of the campaign's client. Never a job title, an email or a phone. |
| `campaign_go_live_state`, `has_host`, refusal `no-host` | Reads "has an active client team member". |
| `lead.host_member_id` and the check `lead_draft_complete` | Step E: the check stops requiring a chosen person and the column is no longer written. Unchanged in step B. |
| `meeting.host_member_id` (NOT NULL today) | Step E: becomes nullable. It is filled with the first person who pressed Accept, so existing meeting reads keep working for confirmed meetings. |
| `lead.proposed_times`, `meeting_reschedule` | No longer written. Kept until clean-up. |
| `client_contact` and the campaign's primary contact | Kept. Fynix gets an "Invite to portal" action on each saved contact, and no new contact is added without a login. |
| About 30 source files name a host | `submit-lead-form.tsx`, `lead-form-data.ts`, `lead-reads.ts`, `lead-record.ts`, `leads.ts`, `meetings.ts`, `availability.ts`, `host-availability.ts`, `client-queue.ts`, `campaign-overview.ts`, `setup-overview.ts`, `columns.ts`, the leak matrix and the seed among them. |

Migrations stay additive. This step stops using the old columns and tables. The drops happen in the clean-up phase of the roadmap, as the second deploy.

One consequence to know: an agency sees the name of every person of a client it serves, where today it sees only the hosts. The per-person calendar needs this. Owner decision of 2026-11-26: names only, never a job title, an email or a phone. Today an agency sees the job title of each host, so that goes.

## 5. The calendar page

One route per role: `/client/calendar`, `/agency/calendar`, `/coordinator/calendar` and `/fynix/calendar`. The Meetings table stays as the list view.

- **Views:** Month, Week, Day.
  - **Day:** a lane per client team member. Free time is empty, busy time is a hatched block with the word Busy.
  - **Week:** a column per day. A block says how many people are free, for example "2 of 3 free". Choosing a time selects that day and slot.
  - **Month:** each day shows its meetings and how many half-hour slots still have someone free. Choosing a day opens it in the day view.
- **Filters:** a client filter for everyone who serves more than one client. Fynix also has an agency filter.
- **State in the address:** view, date, client and agency. A link opens the same view.
- **Navigation:** Previous, Today and Next, by day, week or month.
- **Time zone:** every time is shown in the reader's own zone, with the zone named.
- **Range:** a read covers at most 62 days and goes through the same role connections and row-level security as every other read.
- **Keyboard:** arrows move between days and slots, Enter opens, Escape closes. The time can also be chosen from a list, so no action needs a pointer.

### 5.1 Who sees what

| Who | Clients on the filter | What a slot shows | Meeting details | Meeting link |
|---|---|---|---|---|
| Agency | Clients with a campaign shared to it (`campaign_share`) | Free or busy, per person by name | Its own leads. Another agency's meeting or hold shows as Busy | Its own meetings |
| Coordinator | Clients of its campaigns (`campaign.agency_org_id`) | Free or busy, per person by name | Leads of its own agencies | Meetings of its agencies |
| Client team member | Own company | Colleagues as free or busy. Their own events in full | Meetings of own campaigns, with no agency name | Meetings they are invited to |
| Fynix | Every client, plus the agency filter | Free or busy, and whether a calendar is connected | Everything, with the agency named | Every meeting |

A busy block is one thing to every reader but its owner. A typed blocked time, a synced busy time, another agency's hold and another agency's meeting all read "Busy", so nobody can tell them apart.

### 5.2 Block states

| State | Word | Notes |
|---|---|---|
| Free | None in the day view, "n of m free" in the week view | |
| Busy | Busy | Hatched grey. The reason is never shown |
| Waiting for reply | Waiting for reply | Amber. An invitation has gone out and the slot is blocked until it is answered. Not called "Held", because that word already means a meeting that took place |
| Scheduled | Scheduled | Blue |
| Outcome due, Held, Client no-show, Prospect no-show, Rescheduled, Cancelled | As in the Meetings table today | Same words and colours as the existing status chips |
| Own event | The event's own title | Only on the owner's own calendar |

Status is never colour alone. Each state carries its word.

### 5.3 Words on screen

Owner rule of 2026-11-26: every word a person reads is plain and says what it means. No word needs explaining.

| Word | Means |
|---|---|
| Accept, Decline | The two answers to an invitation |
| Waiting for reply | An invitation has gone out and nobody has accepted yet |
| Busy | The person cannot be booked then. No reason is given |
| Not working | Outside the person's working hours |
| Free | Can be booked |
| No calendar connected | The person has not linked Google or Outlook. Only their working hours are used |
| Calendar disconnected | The link to Google or Outlook stopped working and needs reconnecting |
| Meeting link | The Google Meet link |
| Client team member | Any person of the client. Never "host" |

Kept from the app as it is today: Scheduled, Reschedule needed, Outcome due.

## 6. When a slot is free

One pure function in `lib/`, with tests next to it, decides this for the whole app. For one person and one slot, the slot is free when all of these hold:

1. It is inside the person's weekly hours, read in the zone the hours are set in.
2. It is not inside a blocked time the person typed.
3. It does not overlap a busy time synced from Google or Outlook.
4. It does not overlap a portal meeting the person is going to, or an invitation the person has not answered.
5. It starts at least 48 hours from now, so invited people always have at least 24 hours to accept.

A slot can be booked when at least one client team member is free in it. A person with no connected calendar has nothing under rule 3, so typed hours work on their own. A person who has set no hours at all counts as working Monday to Friday, 09:00 to 17:00 in the client's time zone, until they set their own.

`isOutsideHostHours` in `lib/leads/host-hours.ts` already covers rules 1 and 2 and warns only. It becomes part of this function, and the result blocks.

## 7. Booking and replies

### 7.1 The flow

1. **The prospect agrees a time** with the agency.
2. **The agency opens the calendar** from the lead, filtered to the lead's client, and picks one slot. The meeting length is the campaign's.
3. **The portal checks again.** For each person about to be invited it asks Google or Microsoft about that slot live, then rechecks inside the booking transaction. A person who turns out busy is left out. If nobody is left, the agency is shown the nearest free times.
4. **The slot is held** for each invited person. The lead moves to **Waiting for reply**.
5. **Each invited person is emailed** an invitation with one link, and sees it in the portal.
6. **The first Accept confirms.** The meeting is scheduled, the Meet room is made, the other invited people are released, and the lead moves to **Scheduled**.
7. **Everyone is told** (section 10), and the prospect gets the confirmation letter with the link and the calendar file.

Booking is part of submitting the lead: the lead form's "proposed times" becomes the slot picker. A draft can still be saved without a slot. Fynix can book for an agency through its existing lead actions.

### 7.2 Rules

| Rule | Decision |
|---|---|
| Who is invited | Every active client team member free at that time. The agency can untick people. At least one stays ticked. |
| Hold | An invitation blocks that person's slot for every reader until it is answered or lapses. |
| Decline | That person's hold ends. If every invited person has declined, the lead moves to Reschedule needed at once. |
| Released | After the first Accept the other invitations close and their holds end. A released person still sees the meeting and its link, and can press Accept later to be added. |
| Reply deadline | 24 hours before the meeting starts. The sweep moves an unanswered lead to Reschedule needed and ends the holds. |
| Reschedule needed | The agency picks a new slot from the same lead. This stage exists today (`reschedule_needed`). |
| Moving a scheduled meeting | Either side picks one new free slot. The people free then are invited, and the lead goes back to Waiting for reply. The room and link are kept and the calendar file's sequence rises. Counting rules, such as the 24 hour client no-show, are unchanged. |
| Cancelling, rejecting, withdrawing | As today. Any hold ends. |
| Two bookings at once | The booking transaction takes an advisory lock for each invited person and checks for an overlap before it writes. The second booking sees the first. |

### 7.3 Stages

`lead.stage` gains one value, `awaiting_reply`. The check constraint is widened, never narrowed.

`awaiting_client` is not reused, because `app_leads_waiting` and `sendWaitingReminders` read it and tell a client that a lead is "waiting for a time". New leads never enter `awaiting_client`. Leads already in it finish under the old flow.

```
Draft  -- submit with a slot -->  Waiting for reply  -- first Accept -->  Scheduled  -- meeting ends -->  Outcome due  -->  (unchanged)
                                    |        ^                           |
              nobody accepts, or    |        |  new slot picked          |  moved to a new slot
              everyone declines     v        |                           v
                                  Reschedule needed  <------------------ (back to Waiting for reply)
```

### 7.4 Replying

- **In the portal:** the invitation shows on the person's calendar and in their notices, with Accept and Decline.
- **From the email:** the email carries one link to a reply page that shows the meeting and the two buttons. The outbox keeps one link per message, so the email cannot hold two. The link works without signing in, holds a 32 byte token of which only the SHA-256 is stored, and stops working at the reply deadline (open decision 10).
- **Who runs it:** a reply from the email arrives with no session, so it runs on `leads_auth` through a database function that is handed the token's hash, the way invite redemption works. A reply from the portal goes through the same function from the client connection.
- **The Meet room** is made at the first Accept, before the transaction opens, by `createRoomSafely`. A failure leaves the link empty and never fails the reply, as today at booking.

## 8. Calendar connection

### 8.1 Connecting

A client team member presses Connect calendar on their profile and signs in at Google or Microsoft. The portal never sees their password. A person can connect one Google and one Microsoft account, and busy time is the two together. Only the primary calendar of each account is read.

Only a signed-in client member can start it. The request carries a signed state value tied to the session, and a code verifier (PKCE).

### 8.2 What the portal asks for

Showing a person their own event titles needs permission to read events, which is wider than free/busy. So the proposal is one read path per provider, used for both busy time and own events:

| Provider | Permission | Call |
|---|---|---|
| Google | Read events (`calendar.events.readonly`) | Events of the primary calendar between two times, recurring events expanded |
| Microsoft, work and personal | `Calendars.Read` and `offline_access` | The calendar view between two times |

This is a proposal to prove in the developer test (section 12), not a settled fact. If it holds, the free/busy call and Microsoft's schedule call are not needed, and personal Outlook.com needs no second path.

### 8.3 What counts as busy

An event makes its time busy when the provider marks it busy, tentative or out of office. It does not when it is marked free, is cancelled, or the person declined it. All-day events follow the same mark.

### 8.4 Sync

- A new step of `pnpm leads:sweep` (every five minutes, as `leads_auth`) reads each connected person's events for the next 60 days and replaces that person's rows in `member_busy` in one transaction.
- Every response contains titles. The portal **receives and discards** them: only start and end are written, and no title reaches a log, an error message or the database.
- Provider calls run outside any database transaction.
- A fault with one person never stops the others, and never stops the steps after it.

### 8.5 The live check at booking

Before invitations go out, the portal reads the chosen slot from Google or Microsoft for each person about to be invited. If a provider does not answer, the stored busy time is used. This runs in server code and reads the token through the auth pool. No tenant connection ever reads a token.

### 8.6 A person's own events

When a signed-in client team member opens their own calendar, the server reads that person's events for the visible range and returns titles, start and end to that request only.

- Nothing is stored, cached or logged. The response is marked not to be stored.
- Only the owner's own request can ask. A colleague, an agency and Fynix get Busy.
- A confirmed portal meeting lands in the person's calendar through the calendar file and would come back in this read. It is dropped when its id matches a portal meeting (`<meeting ref>@leads.invalid`), so the person sees it once.

### 8.7 When a connection breaks

- A refused refresh marks the connection broken at once. Other faults mark it broken after three failed syncs in a row.
- A broken connection's busy rows are removed, so the person falls back to typed hours.
- The person gets a notice in the app. Fynix sees a warning on the calendar and on the client's People page.
- Reconnecting is the same Connect button.

### 8.8 Disconnecting

The person presses Disconnect. The portal revokes the token at the provider where the provider allows it, then removes the connection row and its busy rows. These are settings, like `host_hours`, so removing them is allowed.

### 8.9 Code shape

`server/calendar/` mirrors `server/meet/`: a `CalendarProvider` with one method that lists events between two times for a connection, a Google and a Microsoft implementation over plain `fetch`, a provider chosen from the environment, and a fake for tests. No SDK is added.

Switch: `CALENDAR_SYNC_ENABLED` (the exact word `true`), off by default. With it off there is no Connect button, no sync step and no call to anyone, and the calendar runs on typed hours. Variables: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `MICROSOFT_CALENDAR_CLIENT_ID`, `MICROSOFT_CALENDAR_CLIENT_SECRET`, `CALENDAR_TOKEN_KEY`. `pnpm env:check` names a missing one when the switch is on.

## 9. Data

| Table or column | Holds | Who can touch it |
|---|---|---|
| `calendar_connection` (new) | Member, provider, the refresh token encrypted with AES-256-GCM, a key version, status, time of last sync, count of failed syncs | `leads_auth` only. No tenant role and not Fynix. A function returns provider, status and last sync time: a person's own, and all of them for Fynix |
| `member_busy` (new) | Member, start, end | Written by `leads_auth`. No tenant role holds a grant |
| `meeting_attendee` (new) | Meeting, member, reply (`invited`, `accepted`, `declined`, `released`), time of reply, hash of the reply token | Written through database functions. The client reads its own. The supply side reads the name and reply for its own leads |
| `meeting.confirmed_at`, `meeting.reply_due_at` (new) | When the first Accept arrived, and the reply deadline | As `meeting` today |
| `meeting.host_member_id` | Nullable. The first person who pressed Accept | As today |
| `lead.stage` | Check widened with `awaiting_reply` | As today |

How a tenant reads availability: through one database function that returns, for the clients the caller serves and at most 62 days, each person's busy intervals already merged (typed blocks, synced busy time, holds and meetings that are not the caller's). The caller gets start and end, and nothing that tells the kinds apart.

Every new table follows the repo rules: row-level security, a policy for each role with a grant, a hand-written grants migration, an entry in `server/db/columns.ts`, a line in the access matrix, and read paths and probes in the leak matrix. Access tokens are never stored. The encryption key lives in the environment and never in the database.

## 10. Emails and notices

These rows replace the matching rows of the table in `2026-11-24-meetings-and-email-decision.md`. Every other row stands.

| Event | Prospect | Client | Agency | Coordinator | Fynix |
|---|---|---|---|---|---|
| Lead submitted with a slot | | Invitation to each invited person, with the reply link | | If an agency submitted | Yes |
| Client proposed other times | Row removed. It no longer happens | | | | |
| First Accept (was "Time picked") | Confirmation letter | Meeting email, every client team member with meeting emails on | Meeting email | Meeting email | Meeting email |
| Reschedule needed (new) | | | Yes | Yes | Yes |
| Meeting moved to a new slot | Moved letter, on the first Accept for the new time | Invitation to each invited person | Meeting email | Meeting email | Meeting email |

- The invitation carries no calendar file. The calendar file comes with the meeting email once the meeting is confirmed.
- The rules of that note still hold: one email per person, no prospect email names Fynix, the coordinator, an agency or the portal, and the person who acted gets the notice in the app only.
- New notices in the app: an invitation (to the invited person), a confirmation, Reschedule needed, and a broken calendar connection (to its owner).
- All of it sits behind `LAUNCH_EMAILS_ENABLED`, like the other launch emails. The notices do not.

## 11. Privacy and trust

- **What the portal holds:** a token, and when a person is busy. It never holds what they are busy with.
- **What it receives:** every read of a calendar contains titles. They are used for one thing, showing the owner their own calendar, and are otherwise discarded.
- **What others see:** Busy, with no reason and no way to tell a personal event from a portal meeting.
- **Isolation as today:** the client never sees an agency's identity. The prospect never sees Fynix, the coordinator or an agency. An agency sees only the names of client team members, never a job title, an email or a phone.
- **The sign-in screen** will say the app can read the person's calendar. A client's IT team may ask about this. The answer is this section, and it belongs in the privacy policy and the client terms (gate G2).
- **A person can disconnect at any time,** which removes the token and the busy times.

## 12. Gate G5: before a real calendar is connected

Like G3 and G4, this is the owner's set-up plus a short developer session. Steps B to E of the build order do not wait for it.

**What the owner arranges**

1. A Google Cloud project with the sign-in screen set to production, not testing. A project left in testing loses every connection after seven days.
2. The app name, a home page and a privacy policy on a domain the owner can prove is his. The privacy policy describes the calendar use.
3. Google's review of the app for the read-events permission.
4. A Microsoft app registration that accepts work, school and personal accounts.
5. Microsoft publisher verification, which needs a Microsoft partner account for the company. Without it many companies block their staff from approving the app.
6. The calendar wording added to the client terms (G2).

**The developer test, with one Google, one Microsoft 365 and one Outlook.com account**

1. In the Google console, which class the read-events permission is in (sensitive or restricted), and what the review asks for. This decides the lead time, so it is read from the console, not from memory.
2. One events read gives busy time and titles for a Google primary calendar.
3. `Calendars.Read` with the calendar view works for a Microsoft 365 account and for a personal Outlook.com account, from one app registration.
4. The marks of section 8.3 behave as written: free, tentative, declined, cancelled, all-day.
5. Recurring events come back expanded, and times come back in a form that converts cleanly to UTC.
6. A portal calendar file accepted in Gmail and in Outlook comes back in the read with the same id.
7. What a member of staff without admin rights sees at a company that restricts apps.
8. How long a refresh token lives, and that the revoke call works.
9. That a read every five minutes for the expected number of people stays inside each provider's limits.

If item 2 or 3 fails, section 8.2 is revised before step F is planned.

## 13. Testing

- **Free-time function:** unit tests for zones, the days the clocks change, overlaps at the edges, and each rule of section 6.
- **Busy marks:** each provider's implementation against recorded responses. No test calls Google or Microsoft. Tests use the fake provider.
- **Booking:** integration tests for two bookings at once, the first Accept, a second Accept, everyone declining, the deadline in the sweep, and a reply with a wrong or expired token.
- **Leaks:** the leak matrix gains the calendar reads for every audience. No agency read returns a token, a title, an email or a kind of busy time.
- **Titles:** a test that syncs a response with titles and then searches the database and the captured logs for them.
- **Structure:** the automatic checks for row-level security, grants and the audit trigger cover the new tables.
- **Emails:** the invariants test covers the new templates, and the email table test follows section 10.

## 14. Build order

| Step | Delivers | Needs first |
|---|---|---|
| 0 | Gate G5: the owner's set-up and the developer test | Owner |
| A | This spec and the mock approved | Owner |
| B | Client team instead of hosts (section 4): anyone at the client can be chosen, default working hours, the go-live rule, screens and words. One person is still chosen per lead until step E. Plan: `docs/superpowers/plans/2026-11-26-calendar-step-b-client-team.md` | A |
| C | Data layer: the free-time rules (`lib/calendar/free-time.ts`), the invitation table, and one read of each person's name, hours and busy time for the client, its agencies and Fynix. Lists of meetings by date range, which carry meeting details, move to D. Built. Plan: `docs/superpowers/plans/2026-11-26-calendar-step-c-free-time-data.md` | B |
| D | Read-only calendar for every role: month, week, day. Built. The team is named by a campaign, not a client id, because a tenant never reads an organisation id | C |
| E | One-slot booking, replies, the lead flow change, emails and notices | D |
| F | Calendar connection: sign-in, token store, providers, sync, own events, the broken-connection warning | E, and step 0 passed |
| G | Moving and cancelling through the slot picker, reminders, Fynix warnings | E |

Each step gets its own plan in `docs/superpowers/plans/`, written when the step starts. Each ends with lint, typecheck, the tests of the files that changed, and one build. A step that touches `server/db`, grants or row-level security also runs the integration tests for those files.

## 15. Carried over from the 23 November draft, and dropped

**Carried over:** every time in the reader's own zone, status never by colour alone, the phone rule for every screen, the look (tone and ring shadow, no outlines), state in the address, the 62 day read limit, calendar reads in the leak matrix, the keyboard flow, and the Fynix warnings.

Fynix warnings: a person double booked, a person with no hours, a client with no free slot in the next 14 days, an outcome overdue, an invitation waiting past its deadline, a meeting with nobody going, and a broken calendar connection.

**Dropped:** the pool of hosts per campaign, proposals of one to three times with a 48 hour hold, the agenda view, the private subscribe feed, the target strip, a buffer between meetings, a daily cap per person, dragging a block, and the busy heatmap. None was asked for. Any of them can come back as its own decision.

## 16. Open decisions

None of these blocks this spec. The owner settled decisions 1 to 3 on 2026-11-26, as suggested. They are written into sections 4 and 6 and repeated under the table.

| # | Decision | Suggestion |
|---|---|---|
| 1, settled | A person who has typed no hours and connected no calendar. Today such a person is never free, so "everyone can attend" would fail quietly | Monday to Friday, 09:00 to 17:00 in the client's time zone, until they set their own |
| 2, settled | Minimum notice. A booking made less than 24 hours ahead is past the reply deadline at once | A slot must start at least 48 hours ahead, which leaves at least 24 hours to reply |
| 3, settled | Existing client contacts with no login, and the campaign's primary contact | Keep the list for Fynix, add "Invite to portal" on each row, stop adding new ones, decide the removal at clean-up |
| 4 | An invited person becomes busy in their own calendar before replying | Nothing automatic. They press Decline. If everyone does, Reschedule needed |
| 5 | A person who pressed Accept later drops out | If someone else is going, nothing changes. If nobody is, Reschedule needed. Inside 24 hours the existing client no-show rule applies |
| 6 | A reminder for an invitation nobody has answered | One, 24 hours after the invitation, in the app and by email |
| 7 | Agencies see the name of every client team member, not only former hosts | Settled: names only. No job title, email or phone |
| 8 | Phone layout | Day by default, Week shows three days, Month shows a mark per meeting. No agenda list |
| 9 | A client's IT refuses the read-events permission | No narrower fallback in the first version. That person uses typed hours |
| 10 | The reply link works without signing in | Yes. One link, valid until the reply deadline |
| 11 | Sync every five minutes, for the next 60 days | As stated |
| 12 | Which client team member the prospect's letter names | The first person to press Accept |

**Settled on 2026-11-26**

- **1. No hours set:** the person counts as working Monday to Friday, 09:00 to 17:00 in the client's time zone, until they set their own hours.
- **2. Notice:** a meeting is booked at least 48 hours ahead.
- **3. Saved contacts:** they stay. Fynix gets an "Invite to portal" action on each one. No new contact is added without a login.
