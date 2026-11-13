# Phase 1D admin screens

The Fynix admin screens for the set-up built in phase 1D (`2026-11-13-phase-1d-fynix-setup.md`). The comps are approved (`docs/superpowers/specs/phase-1d-admin-comps/`). This plan covers the file map, the reads and the actions. Nothing here changes a table, a grant or a migration.

## Decisions

- **Routes** live under `app/(fynix)/fynix/`. A person who is not signed in goes to sign-in (`requireSessionContext`). A session that is not Fynix gets `notFound()`. Both checks run in the shell and again in every page, because a layout does not re-render on navigation.
- **Landing.** `/welcome` sends a Fynix session to `/fynix`, and `/fynix` sends on to `/fynix/suppliers`. Clients and agencies keep `/welcome` until 1E.
- **Selection is in the URL.** `?supplier=ORG-N7GT`, `?host=<member id>`, `?status=archived`. The campaign page is `/fynix/campaigns/CMP-7Q2X` with one segment per tab (`hosts`, `agreements`, `activity`; the Brief is the index).
- **Reads** are role-shaped Fynix reads in `server/domain` (`fynixRead`, open to staff). Pages never touch a database or a pool. The glue that builds the actor is in `server/fynix/` (`session.ts`, `run-action.ts`, `actions.ts`), so no domain boundary test changes.
- **Writes** are server actions in `server/fynix/actions.ts`. Each one checks the session, validates with the existing zod schema (for field errors), calls the existing domain function (which validates again and checks admin), maps a `DomainError` to plain words, then `revalidatePath("/fynix", "layout")`. Staff see no write control, and the actions still refuse them with the domain's `admin-required`.
- **Layout** switches by CSS only. Below 768 rows are two lines and the panel is a bottom sheet; from 768 to 1279 the panel is a right overlay; from 1280 it is the second column.
- **Forms** use a panel-sized sheet (`components/fynix/form-sheet.tsx`) with the sign-in form parts: label above, tonal input, pill buttons, inline error with an icon.

## Reads to add (TDD, integration tests first)

| Function | File | Used by | Returns |
|---|---|---|---|
| `listSupplierRows` | `server/domain/supplier-overview.ts` | Suppliers table | per supplier: ref, name, status, counts of agencies, people and campaigns, whether an invite is waiting |
| `readSupplierDetail` | same | Suppliers panel | partner agencies with counts, the supplier's people (members and invites, with email), campaigns |
| `listCampaignRows` | `server/domain/campaign-overview.ts` | Campaigns list | ref, name, status, client, supplier |
| `readCampaignHeader` | same | campaign header and Brief | header facts, active host count, the brief fields |
| `listCampaignHosts` | same | Hosts tab | hosts with weekly hours and coming blocks, plus the client's people who could be added |
| `readAgreementsPage` | same | Agreements and shares tab | both agreement sides with who accepted, the shares with who changed them last, the summary, the agencies a share can still go to |

## Actions

| Form | Action | Domain function |
|---|---|---|
| Add supplier | `addSupplierAction` | `createSupplier` |
| Add agency | `addAgencyAction` | `createPartnerAgency` |
| Invite a person | `invitePersonAction` | `issueInvite` (then `sendQueuedMail` after the response) |
| New version | `publishAgreementAction` | `publishAgreement` |
| Add and edit share | `setShareAction` | `setCampaignShare` |
| Remove share | `removeShareAction` | `removeCampaignShare` |
| Add host | `addHostAction` | `addCampaignHost` |
| Edit weekly hours | `setHoursAction` | `setHostHours` |
| Block a time | `addBlockAction` | `addHostBlock` |
| Remove a block | `removeBlockAction` | `removeHostBlock` |
| Pause or reactivate a host | `setHostActiveAction` | `deactivateCampaignHost`, `addCampaignHost` (reactivates with the same title) |

## Pure helpers (`lib/fynix/`, unit tests next to them)

- `format.ts`: clock times, weekly hours, week summary, blocked times, zone label, dates.
- `zoned-time.ts`: a wall time in a zone to an instant (for the block form).
- `form-state.ts`: the form state type and zod issue to words.
- `hours-form.ts` and `block-form.ts`: the weekly hours grid and the Block a time form, read into windows and instants.
- `suppliers.ts`: the Active and Archived filter and the row subtitles.

## File map

- `app/(fynix)/fynix/layout.tsx`, `loading.tsx`, `page.tsx`
- `app/(fynix)/fynix/suppliers/page.tsx`, `loading.tsx`
- `app/(fynix)/fynix/campaigns/page.tsx`, `loading.tsx`
- `app/(fynix)/fynix/campaigns/[ref]/layout.tsx`, `page.tsx` (Brief), `hosts/page.tsx`, `agreements/page.tsx`, `activity/page.tsx`, `loading.tsx`
- `components/fynix/`: `nav-config.ts`, `rail.tsx`, `mobile-nav.tsx`, `app-shell.tsx`, `page-header.tsx`, `side-panel.tsx`, `form-sheet.tsx`, `form-parts.tsx`, `skeletons.tsx`, `empty-state.tsx`, `suppliers/*`, `campaigns/*`, `forms/*`
- `server/fynix/session.ts`, `campaign.ts`, `errors.ts`, `run-action.ts`, `actions.ts` (there is no `data.ts`: pages call the domain reads directly)
- `app/(app)/welcome/page.tsx`: one redirect for Fynix

## Out of scope

Clients, Overview, Leads, Meetings, Inbox, Disputes and Settings pages; the Fynix team page; editing a supplier's name; archiving from the screens; resend and revoke of invites; the Activity tab.
