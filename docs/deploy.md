# Deploying fynix-leads

What the app expects from the server around it. The app is live at `leads.fynix.digital` on the Firstfold VPS. A systemd timer (`fynix-leads-autodeploy`, in the `vps-setup` repository under `fynix/leads/`) pulls `main` every minute, runs the migrations, then builds, so a merge to `main` is a deploy. The outbox and the purge run from timers in the same folder. This file is the checklist those units implement.

## Environment

- Node 24, pnpm 11. `pnpm env:check` names any missing or malformed variable.
- `APP_ORIGIN` must be an `https://` origin in production. The app refuses to start otherwise (session cookies must be Secure).
- `BREVO_API_KEY` is required on https, so invites and reset links are really sent.
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

```cron
* * * * *  cd /srv/fynix-leads && pnpm outbox:run >> /var/log/fynix-leads/outbox.log 2>&1
17 3 * * * cd /srv/fynix-leads && pnpm ratelimit:purge >> /var/log/fynix-leads/purge.log 2>&1
```

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
