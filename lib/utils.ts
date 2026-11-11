import { createCn } from "cn/config";

// The type scale in app/globals.css (--text-caption and so on). Without this the merge reads `text-body` as a colour
// and drops one of `text-ink text-body`.
const FONT_SIZES = ["caption", "label", "table", "body", "row", "value", "lead", "title", "name", "figure", "hero"];

export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: FONT_SIZES }] } },
});
