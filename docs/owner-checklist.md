# What the owner still has to do

Written 2026-11-25, after phases 0 to 7 of the build roadmap were merged. The app is live at `leads.fynix.digital` and holds test data only. Everything below is a step the code cannot do for you. Do them in this order. Steps 1 and 2 are about the server and mail, steps 3 to 5 are decisions and texts, step 6 is the second sign-in step.

## 1. Install the automatic acceptance timer (about 10 minutes)

Without this, no lead is accepted after 48 hours of silence and the client's 12 hour reminders never arrive. The app can run without it, but those two things will not happen.

1. In the `vps-setup` repository, folder `fynix/leads/systemd/`, add two files copied from `docs/ops/` in this repository:
   - `leads-sweep.service` saved as `fynix-leads-sweep.service`
   - `leads-sweep.timer` saved as `fynix-leads-sweep.timer`
2. In the same repository, add both file names to the `for f in ...` list in `fynix/leads/install-leads.sh` (line 102), next to the outbox and purge units, and add the line `systemctl enable --now fynix-leads-sweep.timer` to the commands it prints at the end.
3. On the server, run the install script the way you ran it for the outbox timer, then:

```bash
systemctl enable --now fynix-leads-sweep.timer
```

4. Check that it runs every five minutes:

```bash
systemctl list-timers fynix-leads-sweep.timer
```

```bash
tail -n 20 /var/log/fynix-leads/leads-sweep.log
```

The log shows how many leads were accepted and how many reminders were sent. Running it twice changes nothing, so a repeat is safe.

Note: the template service file says `User=fynix-leads` and `WorkingDirectory=/srv/fynix-leads`. Compare both with `fynix-leads-outbox.service` in the same folder and copy whatever that file uses, because the real paths may differ.

## 2. Meeting rooms and email to prospects

Nothing is sent to a prospect and Google is never called until you finish this. The full detail is in `docs/launch-checklist.md`. In short:

1. Choose the neutral domain and write its name down. It must not contain Fynix, a coordinator or an agency. Keep its registration details private.
2. In your Google Workspace, create one user on that domain, for example `meetings@`, with a neutral display name. It never joins a call.
3. In Cloudflare, make sure the domain's DNS is there. Add the domain in Brevo and add the records Brevo lists, plus a DMARC record. Wait until Brevo says the domain is authenticated.
4. Tell me the domain name, the sender address and the exact Workspace plan name. Then I set `MAIL_SENDER_ADDRESS`, `MAIL_SENDER_NAME` and the Google credentials in the server environment.
5. Run the room test in `docs/launch-checklist.md` (section G4) with two other people on different devices. Run the sender test (section G3), including a letter to a Gmail and an Outlook inbox.
6. Only after both tests pass, set `LAUNCH_EMAILS_ENABLED=true` and `MEET_PROVIDER=google` on the server and restart the app.
7. For each campaign that should email prospects: ask the client for its privacy page link and its agreement to be named in the letter. Then in Fynix, open the campaign, find "Prospect email", paste the link and switch it on.

## 3. Publish the real terms

Settings, "Publish terms". There are three sides: Clients, Coordinators and agencies, and Fynix team. Whatever you publish through that screen counts as real terms and lets invites go out, so paste only the approved text. The terms for clients on your dev database are test text.

Also agree with your lawyer that the coordinator and agency terms oblige them to pass a prospect's removal request to Fynix.

## 4. Decide what is still open

- **A rejection less than 24 hours before the meeting.** It counts zero today. The choices are: it counts as a client no-show (one), it counts zero as any early rejection does, or Fynix decides each case. The rule lives in one function, `lateRejectionCounts` in `lib/domain/counting-month.ts`.
- **Retention.** How long to keep the join record, and a closed lead's prospect details.
- **Email timing.** Whether "lead submitted" goes out at once or as one email every 2 hours, and when the outcome reminders go out.
- **Three client emails.** Whether the client is emailed when a lead is accepted automatically, when Fynix changes a rejection, and when a client no-show is recorded against it. The suggestion is yes to all three.
- **Which host the prospect letter names** when several hosts are invited.

## 5. Fix the GitHub billing

Every GitHub Actions job fails in 2 seconds with "recent account payments have failed or your spending limit needs to be increased". Until it is fixed, a pull request gets no automatic checks. Every merge so far was checked on this machine instead (lint, unit tests, integration tests, build).

## 6. Turn on the second sign-in step for Fynix

1. Each Fynix person opens Profile, "Second sign-in step", and follows the steps with an authenticator app. Keep the backup codes somewhere safe. They are shown once.
2. Only when every Fynix person has done it, set `REQUIRE_FYNIX_2FA=true` on the server and restart the app. Anyone without it is then sent to their profile to enrol.
3. If someone loses their device and their backup codes, the recovery is a short owner SQL step described in `docs/deploy.md`, section G1.

## Not done on purpose

- **The old name columns** (the three brand columns) are still in the database, filled with the client's name and read by nothing. A second release drops them once the first is live.
- **Editing email wording in the app.** The Templates page shows every email. Wording changes go through code and review.
- **Dev data.** Your dev database has sample leads that the browser checks moved forward, and a test terms text for clients.
