# D: Hybrid (navy shell, modular tonal layout)

Tokens: `tokens.css`. Radii: 22 panel and pane, 16 tile and lifted card, 12 row and input, 24 rail, pill for controls.

**Component specs**
- **Rail:** floating, inset 12, 220 wide, radius 24. Wordmark, peach active pill with count, campaign well, "Viewing as" well at the bottom.
- **Page header:** title 28/600 on the canvas, 14px subtitle that states only data facts. Search, bell, avatar at the right.
- **Panel:** white, radius 22, `--shadow-raised` (inset 6% ring plus three layered blurs). No outer border.
- **Tonal pane:** navy 6%, radius 22. Holds the lead list and the record detail column.
- **Lifted card:** white, `--shadow-selected`, 3px peach marker on the left. Other rows sit flat.
- **Tile:** navy 4% on white panels; white with `--shadow-tile-lift` on tonal panes. Icon disc, title, definition list.
- **Hero tile:** navy, one per screen. Geist Serif only for the figure ("3 of 72"), peach progress fill, target marker.
- **Buttons:** 44px pills. Primary navy, secondary navy 7%, destructive red soft. Key hint inside, no outlines.
- **Input:** navy 5% fill, radius 12, navy focus ring only.
- **Chips:** 26px (header) or 22px soft (table), icon plus label. Status fills are tints, never outlines.
- **Table:** tinted header band, 50px rows, inset 7% dividers, no outer lines, empty cells show a faint bar.
- **Action bar:** navy 4% tray pinned to the panel bottom; `--shadow-tray` when content scrolls under.
- **Timeline:** time, icon disc, text, actor. Day labels in the left column. Runs of system events collapse to one line.
- **Message bubbles:** client right on peach tint, Fynix left on navy 5%, one tight corner each.
- **Tooltips and popovers:** white, radius 12, `--shadow-popover`.

**What makes it premium:** one calm navy rail, four distinct depths (canvas, tonal pane, white panel, navy hero), tinted layered shadows, a single peach accent, quiet figures, pill actions with key hints.

**How data is separated:** every group is a titled module. Tonal panes hold lists, white tiles hold facts, the tray holds decisions. Rows split by 7% inset hairlines. Status always pairs icon and label.
