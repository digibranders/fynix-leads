# Launch checklist: the sender domain and the meeting room

What must be true before the portal emails a real prospect or makes a real meeting room. Everything is built and switched off. Nothing is sent to a prospect and Google is not called until the steps below are done and the two switches are turned on. This page is the plain-language version of gates G3 and G4 in `docs/superpowers/specs/2026-11-24-meetings-and-email-decision.md`. Gates G1 (a second sign-in step for Fynix) and G2 (the terms) are separate and unchanged.

## What the owner arranges, in order

1. Give the domain name and the exact name of the Google Workspace plan. Check that nothing on the domain names Fynix and that its registration details are private.
2. Create the room account in the Workspace, for example `meetings@` that domain, with a neutral display name and no person's name. This is one more paid seat.
3. Choose the sender address for portal mail on that domain.
4. Make sure the domain's DNS is in Cloudflare. Add the domain in Brevo and add the records it lists, with a DMARC record.
5. Sign in once as the room account to approve access to Google Meet for the developer session that runs the room test. The developer then gets an OAuth client id, a client secret and a refresh token for that account.
6. Run the room test below with two other people.
7. Ask each client for its privacy page link and for its agreement to be named in the prospect letter.
8. Add the removal-request duty to the agency and coordinator terms (G2): a request to remove a prospect's details arrives in the alias mailbox and must be passed to Fynix.
9. Start sending in small volumes (G3, step 6).

## What the developer sets once the owner has done steps 1 to 5

On the server environment (see `docs/deploy.md`), in this order, one at a time:

1. `MAIL_SENDER_ADDRESS` and `MAIL_SENDER_NAME`: the neutral address. Restart. Account emails now go from it too (invites, resets, alias codes).
2. `MEET_PROVIDER=google` with `GOOGLE_MEET_CLIENT_ID`, `GOOGLE_MEET_CLIENT_SECRET` and `GOOGLE_MEET_REFRESH_TOKEN`. Restart. A time picked by a client now makes a real room.
3. `LAUNCH_EMAILS_ENABLED=true`. Restart. The portal now emails the people of the portal. It still emails no prospect until a campaign has its own switch.
4. Per campaign, as a Fynix admin: the client's privacy link, then the prospect email switch. The switch is refused until the link is set.

Turning a switch off again stops the new behaviour at once. Launch emails already waiting stay in the outbox until the switch is on again, and a link not sent within a day is dropped.

## G4: the room test

One day, in the existing Workspace, with the room account and three people on different devices. No trial account is needed. The owner supplies the account and the people. A short developer session does items 4, 5, 7 and 8 first, because the record of who joined can only be read through the portal's connection to Google Meet.

1. A room opens and a guest joins without knocking, with nobody from the room account present.
2. A guest who is not signed in to Google can join and type a name.
3. Nothing a guest sees names Fynix, the owner's company or the room account's owner.
4. The record of who joined lists every person, including those not signed in, with name, join time and length.
5. The record carries no email address. If it does, note the field so the portal drops it. (The portal already keeps only name, join time and length, and shows "Guest" for a name that looks like an address.)
6. A person signed in to Google: which name shows in the room and in the record. If an agency person joins signed in, the client sees their real account name, which breaks the rule that the client never sees agency people. The join instructions tell agency people to join signed out and type their alias name.
7. Two meetings at the same time from the one account.
8. The base plan is enough: meeting length, number of people, and the record of who joined. If not, name the plan that is.
9. A calendar file opens in Gmail, in Outlook and in a company Exchange mailbox, and a second file moves the same event. The portal sends the file as an attachment named `meeting.ics` with method REQUEST for a new time and CANCEL for a cancellation. Whether Brevo marks the attachment so that Gmail and Outlook treat it as an invitation is not known yet: this item settles it.

## G3: the sender domain

1. The domain name is written into the decision note.
2. The domain is added to Brevo and the records Brevo lists are in Cloudflare, with a DMARC record. Brevo shows the domain as authenticated.
3. A test prospect letter reaches a Gmail inbox and an Outlook inbox, not the spam folder. (Make the test campaign's privacy link and switch, book a time for a lead whose prospect is one of your own addresses.)
4. The full source of that letter is searched for "Fynix", the coordinator's name, the agency's name and the portal address. None may appear, in the headers or the body.
5. A reply to the letter lands in the alias mailbox, and not with Fynix.
6. Volume starts small: Fynix's own test mail first, then one campaign, then the rest.

## What the portal already guarantees

- A prospect letter is only queued when the switch is on, the campaign has a privacy link and its own switch, the lead has a prospect address and a verified alias, and a neutral sender address is set.
- A prospect letter is never sent from an address that names Fynix. If one is configured, the letter waits.
- A prospect letter has no link to the portal. Its only addresses are the Meet link (checked to be on `meet.google.com`) and the client's own privacy page.
- Each message has one recipient. The person who acted is never emailed about their own action.
- The room is made before a booking is saved, and a failure to make one never stops the booking: the screens say the link will follow.
