# Deploying fynix-leads

What the app expects from the server around it. The app is live at `leads.fynix.digital` on the Firstfold VPS. A systemd timer (`fynix-leads-autodeploy`, in the `vps-setup` repository under `fynix/leads/`) pulls `main` every minute, runs the migrations, then builds, so a merge to `main` is a deploy. The outbox and the purge run from timers in the same folder. This file is the checklist those units implement.

## Environment

- Node 24, pnpm 11. `pnpm env:check` names any missing or malformed variable.
- `APP_ORIGIN` must be an `https://` origin in production. The app refuses to start otherwise (session cookies must be Secure).
- `BREVO_API_KEY` is required on https, so invites and reset links are really sent.
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
| Lead sweep | `pnpm leads:sweep` | every 5 minutes | Accepts every lead the client left unanswered for 48 hours after the meeting (decision source `auto`, note "Accepted automatically after 48 hours with no answer"), so it counts as one, and tells everyone on the lead in the app. It also writes the reminders to the client (12, 24 and 36 hours after the outcome) as notices in the app. With `LAUNCH_EMAILS_ENABLED=true` it also queues the emails that depend on time: the email half of the client's reminders (its own stamp, so the notice is unaffected), the prospect's reminders a day and an hour before a meeting, the nudges to record an outcome, and the email of an automatic acceptance. With `MEET_PROVIDER=google` it reads the join record. It needs only `DATABASE_URL_AUTH` (and the environment above), and is safe to run twice: every row is claimed and stamped in the same transaction that writes its email |

```cron
* * * * *  cd /srv/fynix-leads && pnpm outbox:run >> /var/log/fynix-leads/outbox.log 2>&1
17 3 * * * cd /srv/fynix-leads && pnpm ratelimit:purge >> /var/log/fynix-leads/purge.log 2>&1
*/5 * * * * cd /srv/fynix-leads && pnpm leads:sweep >> /var/log/fynix-leads/leads-sweep.log 2>&1
```

The lead sweep also has systemd unit templates in `docs/ops/` (`leads-sweep.service` and `leads-sweep.timer`, every five minutes). They are templates: the live units belong in the `vps-setup` repository under `fynix/leads/`, next to the outbox timer, and must be added there before the merge to `main` that ships the new lead flow. Until then no lead is accepted automatically. The sweep also turns the reminders to the client that are due (12, 24 and 36 hours after the outcome) into notices in the app and stamps them sent; the email half (phase 6) has its own stamp (`lead_reminder.email_sent_at`) and is queued by the same run while `LAUNCH_EMAILS_ENABLED` is true. The outbox runner sends launch emails only while that switch is true too; with it off they would stay pending, and the three account emails are sent as before.

## First deploy order

1. `pnpm db:roles`, `pnpm db:create`, then `pnpm db:migrate` (a deploy migrates before it builds, so migrations stay additive).
2. `pnpm admin:create --email=<address> --name="<full name>"` for the first Fynix admin.
3. Replace the placeholder terms (gate G2). On https no invite is issued while a party's current terms are placeholder text.
4. `pnpm build`, then `pnpm start`.

## Changing a password

`pnpm password:set --email=<address>` sets the password of any existing account (Fynix, client or agency). It asks for the new password twice without echo, applies the same rules as the reset page (length, breached-password check), ends every session of that account and sends no email. It connects as `leads_auth` and needs only the runtime environment, no owner or superuser address. The person signs in again with the new password.

On the production server it is run as root, through a wrapper that runs it as the app user in the live release: `ssh -t firstfold-vps fynix-leads-set-password --email=<address>`. The app user has no sudo rule for it.

## Not covered here

- A script-level Content-Security-Policy. The app sends `frame-ancestors 'none'` and the other basic headers; a full policy needs per-request nonces for Next.js inline scripts.
- Fynix second factor (gate G1): Fynix is password only until then.
- Backups of Postgres and of `UPLOAD_DIR`.
