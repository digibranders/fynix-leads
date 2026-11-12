Phase 1C accept-invite comps: design checklist (Task 14, step 3)

Open index.html. Each sheet has a desktop (1280 wide) and a mobile (390 wide) PNG. The frame, type, spacing, buttons, notices and password field with its show control are the approved 1B ones (comps.css and tokens.css are copies; invite.css holds the few additions).

What to look at, per sheet

1. Client invitee (accept-invite-client)
   - The greeting uses the name Fynix typed. The address is plain text on a quiet tile, with "Client" as the one word for the party. No email or name field.
   - One password field, hint under it, show control inside it.
   - The terms: title, "Version 1", the amber PLACEHOLDER notice above the text, the text in a scrollable tonal region, then the box "I accept these terms" and the button "Create account".
   - States: default, box ticked, submitting ("Creating account", disabled), password shown, long terms scrolled to the end, and focus on the password field, show control, terms region, box and button.
2. Agency invitee (accept-invite-agency)
   - Same layout with the agency terms. The alias is only mentioned in clause 6 of the placeholder text. There is no alias field, no alias value and no mention of the client.
3. Errors (accept-invite-errors): short password, breached password, breach check unavailable, box not ticked, rate limited, address already has an account, something went wrong. Check where each message sits.
4. Terms changed (accept-invite-terms-changed): the notice above the refreshed terms, "Version 2", box cleared, password empty.
5. Link that does not work (accept-invite-link-not-valid): wrong link, expired, withdrawn, used already (with a Sign in button), and rate limited. No name, no address.
6. Success (accept-invite-success): nothing to render, so it shows where the page lands: the holding page (client and agency) and the sign-in page with the new green notice.

Rules checked on every sheet
- No outlined input or panel: PASS. Inputs and the terms region are tonal fills, the panel is white with the raised shadow. The only rings are the 2px navy focus ring and the red invalid ring. One exception to look at: the empty box has a thin 1.5px edge, see "Decisions to confirm".
- At most two surface levels inside a module: PASS. White panel, then tiles and fills (address tile, input, terms region, notice). Nothing sits inside a tile.
- Radii from the scale: PASS. Panel 22, tile, input, notice and terms region 12, box 7, pills for buttons, chips and the show control.
- Status text on its soft fill passes DESIGN.md figures: PASS (table below).
- No error conveyed by colour alone: PASS. Every error and notice has an icon and words. An invalid field or box also has a ring.
- Text sizes from the type scale: PASS. 12.5, 13, 14, 15, 28 only.
- Terms region reachable and scrollable by keyboard: PASS. It is tabindex 0, has role region labelled by the document title, and shows the 2px focus ring (see "Focus: terms region").
- Holds at 390 wide with no horizontal scroll: PASS. scrollWidth measured at 390 and 1280 for all six sheets.
- Tap targets at least 44 by 44: PASS. Measured on every button, link, show control and box row. The box itself is 24px inside a 44px high row that is all clickable.
- Focus visible on password field, show control, terms region, box and button: PASS. Rendered on the client sheet.
- Em dashes and en dashes: none in any file (scanned).
- Strings: identical to lib/domain/invite-messages.ts, lib/auth/messages.ts, lib/auth/password-policy.ts and lib/terms/placeholder.ts (the PLACEHOLDER notice and the placeholder terms text).
- One primary button per panel, labels above inputs, error text below: PASS.

Contrast measured (WCAG ratio from the token values)
- Amber text on amber soft (placeholder notice, rate limit) 6.7; blue text on blue soft 6.9; red text on red soft 6.2; green text on green soft 5.6
- Ink on terms region fill 15.4; muted on the address tile 5.7
- Empty box edge on white 4.6 (needs 3)
- Everything else is as in the 1B checklist (ink on white 16.9, offwhite on navy 14.8, red text on white 7.4, navy focus ring on white 16.9)

Decisions to confirm
- Heading "Welcome, <name>" with the name as Fynix typed it; it wraps to two lines for a long name, which is fine.
- The panel is 440 wide on this screen (400 in 1B) so the terms read comfortably.
- The empty box carries a thin 1.5px edge in a mid grey. A box filled only with navy 5 percent would be nearly invisible on white and fail the 3:1 rule for non-text parts. It is the one place a hairline edge is used.
- The terms region fades at its bottom edge while there is more to read. The fade is a cue only; the text stays readable and scrollable.
- The comp for "long terms scrolled" uses extra stand-in clauses (7 to 11) written for the comp. The real placeholder text is shorter and still scrolls in the default state.
- Heading "Invite not available" is used for all five dead-link states. Only "used already" gets a button, because there is no public way to ask for a new invite. It uses a blue info notice, since it is not a fault.
- "Terms changed" uses a blue info notice, not red, because nothing went wrong.
- Password messages sit under the field (the field is emptied and focused); the breach-check failure sits in an amber notice above the button, as do rate limited, address exists and something went wrong.
- If Fynix withdrew the terms after inviting, the page shows the "wrong link" state (the first one on the dead-link sheet).
- Sheets are grouped by screen, as in 1B, not one HTML file per state.
