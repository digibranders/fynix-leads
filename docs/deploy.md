# Deploying fynix-leads

What the app expects from the server around it. The app is live at `leads.fynix.digital` on the Firstfold VPS. A systemd timer (`fynix-leads-autodeploy`, in the `vps-setup` repository under `fynix/leads/`) pulls `main` every minute, runs the migrations, then builds, so a merge to `main` is a deploy. The outbox and the purge run from timers in the same folder. This file is the checklist those units implement.

## Environment

- Node 24, pnpm 11. `pnpm env:check` names any missing or malformed variable.
- `APP_ORIGIN` must be an `https://` origin in production. The app refuses to start otherwise (session cookies must be Secure).
- `BREVO_API_KEY` is required on https, so invites and reset links are really sent.
- `REQUIRE_FYNIX_2FA=true` (gate G1) makes every Fynix person turn on the second sign-in step before any other Fynix page opens: a Fynix person without it is sent to their profile page to set it up, and Fynix forms refuse them until they do. Anything but the exact word `true` is off, and it is off by default so a deploy never locks anyone out. Turn it on only after every Fynix person has enrolled (see "Fynix second sign-in step" below). Client and agency people are never affected.
- Phase 6 switches, all off while unset (the app then sends only the invite, the password reset and the alias code, from `hello@fynix.digital`, and makes no meeting room). The owner steps and the checks that must pass before any of them is turned on are in `docs/launch-checklist.md`.
  - `LAUNCH_EMAILS_ENABLED=true` queues and sends every launch email (lead, meeting, reminder and decision emails, and prospect letters). Anything but the exact word `true` is off. It needs `MAIL_SENDER_ADDRESS`; the app refuses to start with the switch on and a sender that names Fynix. A prospect letter is also only written for a campaign whose privacy link is set and whose prospect email switch is on (Fynix admin, per campaign).
  - `MAIL_SENDER_ADDRESS` and `MAIL_SENDER_NAME` set the address and display name everything goes out from. Unset means `hello@fynix.digital` as "Fynix". The neutral domain must first be authenticated in Brevo (gate G3).
  - `MEET_PROVIDER` is `none` (the default: no room is made, the screens say the link will follow) or `google`. `google` needs `GOOGLE_MEET_CLIENT_ID`, `GOOGLE_MEET_CLIENT_SECRET` and `GOOGLE_MEET_REFRESH_TOKEN` of the one neutral room account. The sweep then also reads who joined each room, once, 30 minutes after the meeting ended.
- `CLAMAV_HOST` (and `CLAMAV_PORT`, default 3310) is required in production. Without it every upload is refused, by design.
- `UPLOAD_DIR` points at a persistent, backed-up volume outside the checkout. The default (`.data/uploads`) is for development.

## nginx

Three things the app trusts nginx to do.

1. **Overwrite `x-real-ip`.** Rate limits key on it. If nginx forwards a client-supplied value, a caller can pick their own limit bucket; if it sends nothing, every caller shares the bucket "unknown".
2. **Cap request bodies per route.** Next.js allows 52 MB on every Server Action, including sign-in and password reset. Only the message pages need that.
3. **Terminate TLS.** The app sets HSTS, but it only means something over https.

```nginx
server {
    listen 443 ssl http2;
    server_name leads.fynix.digital;

    # Everything else: forms are small.
    client_max_body_size 1m;

    # Message pages post up to five 10 MB files as part of the form.
    location ~ ^/(client/messages|agency/messages|supplier/messages|fynix/inbox) {
        client_max_body_size 55m;
        include /etc/nginx/snippets/leads-proxy.conf;
    }

    location / {
        include /etc/nginx/snippets/leads-proxy.conf;
    }
}
```

`/etc/nginx/snippets/leads-proxy.conf`:

```nginx
proxy_pass http://127.0.0.1:3020;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
```

## Scheduled jobs

Both run from the checkout with the production environment loaded. Use a systemd timer or cron.

| Job | Command | How often | Why |
|---|---|---|---|
| Send queued email | `pnpm outbox:run` | every minute | Sends invites and reset links, retries failures, purges links older than a day |
| Purge rate limits | `pnpm ratelimit:purge` | daily | Removes windows for keys that never return |
| Lead sweep | `pnpm leads:sweep` | every 5 minutes | Accepts every lead the client left unanswered for 48 hours after the meeting (decision source `auto`, note "Accepted automatically after 48 hours with no answer"), so it counts as one, and tells everyone on the lead in the app. It also writes the reminders to the client (12, 24 and 36 hours after the outcome) as notices in the app. With `LAUNCH_EMAILS_ENABLED=true` it also queues the emails that depend on time: the email half of the client's reminders (its own stamp, so the notice is unaffected), the prospect's reminders a day and an hour before a meeting, the nudges to record an outcome, and the email of an automatic acceptance. With `MEET_PROVIDER=google` it reads the join record. It needs only `DATABASE_URL_AUTH` (and the environment above), and is safe to run twice: every row is claimed and stamped in the same transaction that writes its email It also reminds a client once a day, from 9 am there, of leads that have waited more than 24 hours for a time, and writes the notice of a target an automatic acceptance completes. |

```cron
* * * * *  cd /srv/fynix-leads && pnpm outbox:run >> /var/log/fynix-leads/outbox.log 2>&1
17 3 * * * cd /srv/fynix-leads && pnpm ratelimit:purge >> /var/log/fynix-leads/purge.log 2>&1
*/5 * * * * cd /srv/fynix-leads && pnpm leads:sweep >> /var/log/fynix-leads/leads-sweep.log 2>&1
```

The lead sweep also has systemd unit templates in `docs/ops/` (`leads-sweep.service` and `leads-sweep.timer`, every five minutes). They are templates. The live units are `fynix-leads-sweep.service` and `fynix-leads-sweep.timer` in the `vps-setup` repository under `fynix/leads/systemd/`, next to the outbox timer, installed on the Firstfold VPS on 2026-11-25 and enabled. The sweep also turns the reminders to the client that are due (12, 24 and 36 hours after the outcome) into notices in the app and stamps them sent; the email half (phase 6) has its own stamp (`lead_reminder.email_sent_at`) and is queued by the same run while `LAUNCH_EMAILS_ENABLED` is true. The outbox runner sends launch emails only while that switch is true too; with it off they would stay pending, and the three account emails are sent as before.

## First deploy order

1. `pnpm db:roles`, `pnpm db:create`, then `pnpm db:migrate` (a deploy migrates before it builds, so migrations stay additive).
2. `pnpm admin:create --email=<address> --name="<full name>"` for the first Fynix admin.
3. Replace the placeholder terms (gate G2). On https no invite is issued while a party's current terms are placeholder text.
4. `pnpm build`, then `pnpm start`.

## Changing a password

`pnpm password:set --email=<address>` sets the password of any existing account (Fynix, client or agency). It asks for the new password twice without echo, applies the same rules as the reset page (length, breached-password check), ends every session of that account and sends no email. It connects as `leads_auth` and needs only the runtime environment, no owner or superuser address. The person signs in again with the new password.

On the production server it is run as root, through a wrapper that runs it as the app user in the live release: `ssh -t firstfold-vps fynix-leads-set-password --email=<address>`. The app user has no sudo rule for it.

## Fynix second sign-in step (gate G1)

Built on Better Auth's two-factor plugin: a code from an authenticator app (TOTP, six digits, 30 seconds) after the password, plus ten backup codes that each work once. It is for Fynix people only; the enrol action refuses anyone else. Migrations 0076 and 0077 add `user.two_factor_enabled` and the `two_factor` table (encrypted secret and backup codes, `leads_auth` alone).

Rolling it out, in this order:

1. Merge and deploy (the deploy migrates first). Nothing changes for anyone: `REQUIRE_FYNIX_2FA` is unset.
2. Each Fynix person opens Profile, then "Second sign-in step", enters their password, adds the key to an authenticator app (the key is shown as text with a copy button, and as a link that opens the app on a phone), enters the first code and saves the ten backup codes. The codes are shown once.
3. Check that each person can sign out and sign in again with a code. Each person's enrol, turn-off and every backup-code sign-in is in the audit log (Fynix admins: Audit log in the System menu).
4. Set `REQUIRE_FYNIX_2FA=true` and restart. A Fynix person who has not enrolled is then sent to their profile page.

Limits and behaviour to know:

- Wrong codes are limited three ways: five per challenge (the cookie issued after the password, ten minutes), ten per challenge and twenty per network address in 15 minutes (our limit, in Postgres), and a 15 minute lock on the account after ten failed codes in a row (the plugin's). A used backup code never works twice.
- Turning the step on or off ends the current session and issues a new one, which restarts the 12 hour lifetime for that sign-in.
- The "must enrol" rule covers every Fynix page and the Fynix admin forms (`runAction`). The other Fynix server actions (leads, messages, exports) check only the session, so someone without the step who calls them directly is not stopped by this switch alone. Pages are the gate.
- Lost phone and lost backup codes: there is no self-service reset, on purpose. The owner removes the second step in the database as `leads_owner` (this is not audited, so say so in the audit trail by other means), then the person signs in with the password and enrols again:

  ```sql
  BEGIN;
  DELETE FROM two_factor WHERE user_id = (SELECT id FROM "user" WHERE email = 'person@example.com');
  UPDATE "user" SET two_factor_enabled = false WHERE email = 'person@example.com';
  DELETE FROM session WHERE user_id = (SELECT id FROM "user" WHERE email = 'person@example.com');
  COMMIT;
  ```

  If `REQUIRE_FYNIX_2FA` is on and every admin is locked out, unset it, restart, recover, set it again.
- After the migration, the running dev server needs `pnpm db:migrate` before sign-in works again, because Better Auth now reads the new column.

## Not covered here

- A script-level Content-Security-Policy. The app sends `frame-ancestors 'none'` and the other basic headers; a full policy needs per-request nonces for Next.js inline scripts.
- Backups of Postgres and of `UPLOAD_DIR`.
