Phase 1D comps: Fynix admin, suppliers and campaign set-up

Open index.html. Three screens at 1280 by 900 and 390 wide, built on the approved table comps (tokens.css and app.css are copies; admin.css holds the additions). Sample names are invented.

What to look at

1. Suppliers (suppliers)
   - Table: ref, supplier, counts of agencies, people and campaigns, with Active and Archived filters. A supplier whose invite is not accepted yet says so in the row.
   - Side panel: partner agencies with people and campaign counts, people with role, email and status (Fynix sees emails), and campaigns with status.
   - Actions: Invite a person, Add agency, edit. Add supplier sits in the page header.
2. Campaign, agreements and shares (campaign-agreements)
   - Campaign header: status, client, supplier, campaign time zone and meeting length. Tabs: Brief, Hosts, Agreements and shares, Activity.
   - Two agreement cards: version, accepted or waiting, who accepted and when, per month, in total, dispute window, the counting rule in words, the version history line and New version.
   - Shares table: each agency and the supplier's own bookings, monthly share, delivered this month, who changed it last. Total row reads "15 of 14", and an amber notice explains the over-allocation (allowed, D17 style).
3. Campaign, hosts (campaign-hosts)
   - Hosts table: name and title, a summary of weekly hours, the next block, status.
   - Side panel: the time zone the hours are in, the week day by day (split days shown as two ranges), blocked times with remove, Block a time and Pause host.

Rules checked: tints and the raised shadow only, no outlines; every status chip has an icon and a word; radii from the scale; no horizontal page scroll at 390 or 1280; no em or en dashes in any file.

Decisions to confirm
1. A Campaigns item is added to the Fynix rail, between Suppliers and Leads (the spec listed the campaign page but no rail item).
2. Clients get the same table and side panel as Suppliers, with contacts and hosts in the panel. Not drawn separately.
3. Staff see these screens read-only: the edit buttons, New version, Add share, Invite and Add agency are hidden for staff.
4. The supplier's own bookings appear as a share row named after the supplier.
5. "Delivered in November" in the shares table stays empty until phase 3 counts meetings.

Not drawn yet: the Brief tab (the 1C brief fields as a form), the forms behind New version, Add share, Add host, Edit hours and Block a time, Clients, the Fynix team page, and empty states.
