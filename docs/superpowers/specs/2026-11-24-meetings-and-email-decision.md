# Meetings and email: rooms, sender domain and launch emails

Owner decision, 2026-11-24. This confirms and narrows sections 9, 10, 15, 16, 18 and 19 of `2026-11-12-leadgen-portal-design-v2.md`, and replaces them where they differ. It follows the lead flow in `2026-11-24-lead-flow-decision.md`. It is a decision record. The code for it was built on 2026-11-25 and is switched off until the sender domain and the room account are set up (`docs/owner-checklist.md`, section 2).

## Decisions

| Topic | Decision |
|---|---|
| Meeting link | The portal creates an open Google Meet room when the client picks a time (D25 confirmed). The agency or coordinator never pastes its own link, not even as a stopgap. No other provider. |
| Room owner | One neutral account owns every room, for every client. It is a new user in the Google Workspace the owner already pays for (base plan), which sits on a neutral spare domain. The account never joins a call. |
| Who joined | After the meeting the portal reads who joined, when, and for how long. The client, the agency, the coordinator and Fynix all see it beside the outcome. |
| Email addresses | The join record never shows an email address. The portal keeps only the name, the join time and the length of stay. Anything else the room reports is dropped. |
| Names in the join record | Shown as they appeared in the room, to everyone. See "Risks accepted". |
| Sender domain | All portal mail goes from one neutral domain (D26 confirmed), prospect letters included. It is the same domain as the Workspace. The owner confirmed that the domain exists, that the Workspace is set up on it, and that it is spare: no website and no everyday mail. Its name is not written down yet. |
| DNS | The owner adds the records himself, in Cloudflare. |
| Prospect replies | They go to the alias mailbox that signs the letter (D33 confirmed). Fynix does not see them. |
| Privacy line | The prospect letter names the client brand as the holder of the prospect's details and links to the client's own privacy page. |
| Before launch | No real prospect is entered or emailed until the room test (G4) and the sender domain (G3) have passed. Test data only until then. |

Until the new domain is ready, the portal keeps sending only what it sends today: invites, password resets and alias codes, from `hello@fynix.digital`. Those move to the new domain at the switch.

## Emails at launch

Everything below must exist on day one. The stage names follow the lead flow note: picking a time schedules the meeting, and "accepted" means the client's answer after the meeting.

| Event | Prospect | Client | Agency | Coordinator | Fynix |
|---|---|---|---|---|---|
| Lead submitted | | A lead is waiting for a time | | If an agency submitted | Yes |
| Client proposed other times | | | Yes | Yes | Yes |
| Time picked | Confirmation letter | Meeting email, every contact | Meeting email | Meeting email | Meeting email |
| Meeting postponed | Moved letter | Meeting email | Meeting email | Meeting email | Meeting email |
| Meeting cancelled, or lead rejected before the meeting | Cancelled letter | Meeting email | Meeting email, with the note | Meeting email, with the note | Meeting email |
| A day before | Reminder | | | | |
| An hour before | Reminder | | | | |
| Outcome not recorded | | | Nudge | Nudge | Nudge |
| Outcome recorded: meeting finished | | Asked to accept or reject, with a note | Yes | Yes | Yes |
| Every 12 hours until the client answers (12, 24 and 36 hours after the outcome) | | Reminder to accept or reject, with the time left before the lead is accepted for it | | | |
| Lead accepted | | | Yes | Yes | Yes |
| Lead rejected | | | Yes, with the note | Yes, with the note | Yes, with the note |
| Lead accepted after 48 hours with no answer | | | Yes | Yes | Yes |
| Fynix changed a rejection to accepted | | | Yes | Yes | |
| Outcome recorded: client no-show (counts as one) or prospect no-show (closes the lead). No client decision follows | | | Yes | Yes | Yes |

Rules for every email, unchanged from the spec:

- One email per person. Never two people in To or CC.
- A prospect email never contains "Fynix", the coordinator's name, an agency's name or a portal link.
- Every meeting email carries a calendar file that a postponement or a cancellation can update.
- The person who acted gets the notice in the app only.

Built later: target met, over share, agreement changed, and the daily "still to respond" reminder.

## The privacy line

Draft wording, added under the signature of every prospect letter:

```
{client_brand} holds your contact details to arrange this meeting. Privacy policy: {client_privacy_link}
To have your details removed, reply to this email.
```

- Each campaign stores the client's privacy link. Prospect email cannot be switched on for a campaign without it.
- The client must agree to be named as the holder.
- A removal request arrives in the alias mailbox, which the agency or the coordinator owns. Their terms (gate G2) must oblige them to pass it to Fynix, and Fynix removes the data (spec section 16).
- The wording needs a check by whoever writes the terms.

## Risks accepted

- **Real names in the join record.** A person signed in to Google appears under the real account name. If an agency person joins signed in, the client sees that name, which breaks acceptance rule 2 of the spec. Guard: the join instructions tell agency people to join signed out and type their alias name, and the room test checks what shows. Fallback if it goes wrong in practice: show a name only where the portal can match it to the lead, and "Guest" otherwise.
- **One domain for everything.** Invites and password resets share a reputation with prospect letters. A spam complaint from a prospect can slow down all portal mail.
- **A spare domain is visible.** A prospect can look the domain up. It must stay free of anything that names Fynix, the coordinator or an agency: no such website, and private registration details.

## What must be true before a real prospect is emailed

Gates G1 (second factor for Fynix) and G2 (terms) are unchanged. G3 and G4 are now these checklists.

**G4, the room test.** One day, in the existing Workspace, with the new room account and three people on different devices. No trial account is needed. The owner supplies the account and the people. A short developer session does items 4, 5, 7 and 8 before the main build, because the join record can only be read through the portal's connection to Google Meet.

1. A room opens and a guest joins without knocking, with nobody from the room account present.
2. A guest who is not signed in to Google can join and type a name.
3. Nothing a guest sees names Fynix, the owner's company or the room account's owner.
4. The join record lists every person, including those not signed in, with name, join time and length.
5. The join record carries no email address. If it does, note the field so the portal drops it.
6. A signed-in person: which name shows in the room and in the record.
7. Two meetings at the same time from the one account.
8. The base plan is enough: meeting length, number of people, and the join record. If not, name the plan that is.
9. A calendar file opens in Gmail, in Outlook and in a company Exchange mailbox, and a second file moves the same event.

**G3, the sender domain.**

1. The domain name is written into this note.
2. The domain is added to Brevo and the DNS records Brevo lists are in Cloudflare, with a DMARC record. Brevo shows the domain as authenticated.
3. A test prospect letter reaches a Gmail inbox and an Outlook inbox, not the spam folder.
4. The full source of that letter is searched for "Fynix", the coordinator's name, the agency's name and the portal address. None may appear, in the headers or the body.
5. A reply to the letter lands in the alias mailbox.
6. Volume starts small: Fynix's own test mail first, then one campaign, then the rest.

## What the owner arranges, in order

1. Give the domain name and the exact name of the Workspace plan. Check that nothing on the domain names Fynix and that its registration details are private.
2. Create the room account in the Workspace, for example `meetings@` the domain, with a neutral display name and no person's name. This is one more paid seat.
3. Choose the sender address for portal mail on that domain.
4. Make sure the domain's DNS is in Cloudflare. Add the domain in Brevo and add the records it lists.
5. Sign in once as the room account to approve access to Google Meet for the developer session that runs the room test.
6. Run the room test (G4) with two other people, alongside that session.
7. Ask each client for its privacy page link and its agreement to be named in the prospect letter.
8. Add the removal-request duty to the agency and coordinator terms (G2).
9. Start sending in small volumes (G3, step 6).

## What would then need building

- **Room on booking.** Create the room when the client picks a time and keep the same link through every postponement. Today the accept branch of `clientReviewLead` in `server/domain/leads.ts` saves no link and the screens show "Meet link to follow".
- **Sender.** `server/mail/brevo.ts` sends everything as "Fynix" from `hello@fynix.digital`. It needs the new domain, a sender name per message, a reply-to address and attachments.
- **Outbox.** `server/mail/outbox.ts` fails any message that has no link, or whose link is not on the portal's address. A prospect letter has no portal link and carries a Meet link.
- **Templates.** There are three today (invite, password reset, alias code) in `lib/email/templates.ts`. The table above needs one per audience and event, with the alias identity chosen for the lead signing the prospect letter, the privacy line, and the per-campaign override (D35).
- **Calendar file on the server.** Today it is made in the browser only (`components/meetings/meeting-actions.tsx`) and its id ends in `@fynix.digital`. It needs a neutral fixed id and a rising sequence number.
- **Scheduled job.** Reminders, outcome nudges, the 48 hour warning and auto-accept, and the join record import. The server already runs the outbox every minute. A queued link that is not sent within a day is purged, so a reminder is queued when it is due, not at booking.
- **Join record.** Import it after the meeting, store name, join time and length only, and show it beside the outcome for all four parties.
- **Who may record an outcome.** `server/domain/meetings.ts` allows only the client and the agency today. The coordinator and Fynix are to be added.
- **Campaign settings.** A field for the client's privacy link, and a switch that keeps prospect email off until the link is set and the gates have passed.
- **Tests.** No prospect email contains "Fynix", the coordinator's name, an agency's name or a portal link. No email has more than one recipient. No join record shows an email address.

## Still open

- The sender domain's name (D37) and the sender address. Owner to give.
- The exact Workspace plan, and whether it is enough. Settled by the room test.
- When the outcome nudges go out. Spec section 10 says at the end of the meeting and again after 24 hours.
- Which host is named in the prospect letter when several are invited (open decision 2 of `2026-11-23-calendar-design.md`).
- How long the join record and a closed lead's prospect data are kept (spec section 19, question 4).

Settled by the owner on 2026-11-25 and built (see `2026-11-25-pending-emails-design.md`): "lead submitted" is sent at once; the client is emailed when a lead is accepted for it after 48 hours, when Fynix changes its rejection and when a client no-show is recorded; the emails this note left for later (target met, over share, agreement changed, the daily reminder) and a per-campaign opening paragraph for the confirmation letter.

Settled by the owner later on 2026-11-24: the client is reminded every 12 hours after the outcome until it answers, and the lead is accepted for it at 48 hours.

Settled elsewhere since the lead flow note was written: a prospect no-show closes the lead, and the client, the agency, the coordinator and Fynix can all record an outcome.
