Phase 1D comps: tables, side panel and messages (spec v2, 13.1 to 13.3)

Open index.html. Four screens, each at 1280 by 900 and at 390 wide. The shell, tokens, type, chips, rows, bubbles and buttons are the approved phase 0 ones (tokens.css is a copy; app.css holds the layout). Sample names are invented: Northgate Outreach is the supplier, Ridgeline Partners and Calder Bay Media are its agencies, Kestrel Ledger is the client.

What to look at, per screen

1. Leads, supplier view (leads-supplier)
   - Table: Ref, Prospect (name and company), Stage, Meeting (sorted), Source. Times in the reader's zone, named once in the toolbar.
   - Toolbar: count and zone with Export, then the stage filter on its own row, then search, agency and month.
   - Side panel for the selected row: stage, ref, Open record, close. Who booked it and the alias used. Meeting tile with both zones, host and the outcome deadline. "Who joined" from the Meet room. The outcome choice, a note, Save outcome.
   - The table stays in view. J and K move between leads, Esc closes the panel.
2. To respond, client view (to-respond-client)
   - The same table, filtered to leads waiting for the client, oldest first, overdue in red with an icon and the word.
   - Side panel: waiting time, the alias identity the prospect knows (name, title, email, D36), the proposed times each checked against the host's free hours, the qualification, then Accept this time, Other times, Decline. No supplier or agency name anywhere.
3. Messages, supplier view (messages-supplier)
   - Left: a table of threads (who it is with, lead or campaign, last message, time, unread count). Filter All or Unread, search, filter by who.
   - Right: the thread, a line saying who can see it, a PDF attachment, "Forward to Ridgeline Partners" under a Fynix message, and the composer with the file rule.
4. Inbox, Fynix view (inbox-fynix)
   - Threads grouped under Client side and Supply side. Supplier and agency threads are not listed (Fynix does not read them).
   - The forward box: the text as it will be sent, with the removed phone number and email marked, a line saying what was removed, then Forward, Edit text, Cancel.

On a phone (390 wide)
- The rail becomes a navy top bar with the menu.
- Table rows become two-line rows: name, company and one detail on the left, the stage or waiting time on the right.
- The side panel opens as a bottom sheet over the list, with the actions pinned at the bottom.
- Messages: the thread list and the open thread are separate screens, with a back button on the thread.

Rules checked
- No outlined inputs, panels or rows: tints and the raised shadow only. The one outline is the 1.5px peach edge on the chosen option, matching the selected-card treatment.
- Status is never colour alone: every chip and the overdue mark have an icon and a word.
- Radii from the scale: panels 22, tiles 16, rows, options and inputs 12, pills for buttons, chips and filters.
- No horizontal page scroll at 390 or 1280 (measured on all twelve renders). The stage filter scrolls inside its own strip on a phone.
- Em dashes and en dashes: none in any file (scanned).

Decisions to confirm
1. Panel width 400. With the panel open the supplier table keeps five columns and long names wrap; with it closed the table takes the full width (not drawn).
2. Stage words in the chips are shortened from the spec: "With client" for Awaiting client, "Reschedule" for Reschedule needed. The filter groups are All, Needs you (outcome due, reschedule, drafts), With client, Scheduled, Delivered, Closed.
3. "Who joined" lists names as people typed them in Meet, as the spec says; there is no automatic matching to the host or prospect.
4. The client's times are radio rows with the host's free-hours check, and accept is the main button. Keys: A accept, O other times, D decline.
5. The thread list is a two-column table (Thread, Last) rather than a wider table, because it shares the page with the open thread.
6. The forward box is blue (information), and the removed parts are amber marks inside the text.

Not drawn yet: the panel closed, empty and loading states, the Fynix and agency lead tables, the meetings table, the lead record's messages panel (it is the approved phase 0 one).
