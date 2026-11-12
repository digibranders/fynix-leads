Phase 1B auth comps: design checklist (Task 11, step 3)

Checked against DESIGN.md and the d-hybrid comps. Contrast figures are WCAG ratios measured from the token values in tokens.css (navy 5 percent input fill composited over white).

Rules checked on every sheet (frame, sign-in, forgot password, reset password, holding page)
- No outlined input or panel: PASS. Inputs are navy 5 percent fills, the panel is white with the raised shadow stack; the only rings are the 2px navy focus ring and the red invalid ring.
- At most two surface levels inside a module: PASS. Panel (white) and input or notice fills only. The reset sheet's "alternative" block sits on a tonal pane outside the screens.
- Radii from the scale: PASS. Panel 22, input and notice 12, pills for buttons, chips, show control, avatar.
- Status text on its soft fill passes DESIGN.md figures: PASS (table below).
- Error not conveyed by colour alone: PASS. Every error or notice carries an icon and words; field errors sit below the input with an icon; the invalid input also has a ring.
- Text sizes from the type scale: PASS. 12.5 (labels, hints, errors), 13 (links, show control, chips), 14 (body, inputs, notices, buttons), 16 (brand, avatar initials), 28/34 (screen heading).
- Holds at 390 wide with no horizontal scroll: PASS. scrollWidth measured at 390 and 1280 for all five sheets.
- Tap targets at least 44px: PASS. Inputs 44, buttons 44, show control 44 high by 44 wide minimum, text links 44 high.
- Focus visible on email field, password field, show control, primary button: PASS. Rendered explicitly on the sign-in sheet; password field, show control and button on the reset sheet; email field and button on the forgot sheet.
- Em dashes and en dashes: none in any file (scanned).
- Strings: identical to lib/auth/messages.ts, lib/auth/password-policy.ts and retryMessage (verified by script).
- One primary button per panel, one line labels, labels above inputs, error text below: PASS.

Contrast measured
- ink on white 16.9; ink-2 on white 8.7; muted on white 6.2; muted on canvas 5.4; ink on canvas 14.5; ink-2 on canvas 7.4
- ink on input fill 15.4; ink-2 on input fill (show control) 7.9; ink on invalid fill 14.1
- amber text on soft 6.7; green 5.6; red 6.2; blue 6.9
- red text on white (field error) 7.4
- offwhite on navy (primary button) 14.8; on navy-hover (submitting) 13.0
- ink on peach (brand mark, avatar) 8.8; ink on neutral chip 14.7
- Non-text: red invalid ring on white 4.4 (needs 3); navy focus ring on white 16.9, on canvas 14.5

Decisions to confirm
- Inactive account shows the same message as a wrong password, because messages.ts never says which was wrong.
- The sent state of forgot password uses a blue info notice, not green, so it does not suggest the address exists.
- Sign-in submitting state uses the navy-hover fill instead of faded opacity, to keep contrast.
- The screen heading uses the 28px title step, since the panel is the whole screen, not a module title (15px in DESIGN.md).
- Rate limit minutes other than 2 (41 and 9) are examples; the wording comes from retryMessage.
