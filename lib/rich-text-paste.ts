import type { ChildNode, Element } from "domhandler";
import { DomUtils, parseDocument } from "htmlparser2";
import { cleanRich, richToText } from "./rich-text";

/**
 * Reads what a person copies from Word (or Google Docs, or a web page) and sorts it: a list of questions with their expected answers, or a
 * long document split into named sections. It works on the clipboard's HTML cleaned to the same small subset the editor stores, so there is no
 * browser dependency and the rules can be tested. Nothing here guesses with a model: a heading, a number, a "Q1." or "Answer:" label, a bullet
 * or a table column is what it looks for, and the paste dialog shows the result for the person to correct before anything is used.
 */

export type Block = {
  /** A heading, a paragraph, a list item, or one table row. */
  readonly kind: "heading" | "paragraph" | "item" | "row";
  /** The inner HTML (clean subset). For a row, empty: see `cells`. */
  readonly html: string;
  readonly text: string;
  /** List depth, 0 for the top level. */
  readonly depth: number;
  readonly ordered: boolean;
  readonly cells: readonly string[];
};

const block = (kind: Block["kind"], html: string, depth = 0, ordered = false, cells: readonly string[] = []): Block => ({ kind, html, text: richToText(`<p>${html}</p>`), depth, ordered, cells });

const BULLET = /^\s*[•·▪●◦‣*-]\s+/;
const NUMBER = /^\s*\d{1,2}\s*[.)]\s+/;

const inner = (node: ChildNode): string => DomUtils.getInnerHTML(node);

function listBlocks(list: Element, depth: number, out: Block[]): void {
  const ordered = list.name === "ol";
  for (const child of list.children) {
    if (child.type !== "tag" || child.name !== "li") continue;
    const own = child.children.filter((node) => !(node.type === "tag" && (node.name === "ul" || node.name === "ol")));
    out.push(block("item", own.map((node) => DomUtils.getOuterHTML(node)).join("").trim(), depth, ordered));
    for (const node of child.children) if (node.type === "tag" && (node.name === "ul" || node.name === "ol")) listBlocks(node, depth + 1, out);
  }
}

function walk(nodes: readonly ChildNode[], out: Block[]): void {
  for (const node of nodes) {
    if (node.type === "text") {
      const text = node.data.trim();
      if (text !== "") out.push(block("paragraph", text));
      continue;
    }
    if (node.type !== "tag") continue;
    if (node.name === "ul" || node.name === "ol") listBlocks(node, 0, out);
    else if (node.name === "h2" || node.name === "h3" || node.name === "h4") out.push(block("heading", inner(node).trim()));
    else if (node.name === "tr") out.push(block("row", "", 0, false, node.children.filter((cell) => cell.type === "tag" && (cell.name === "td" || cell.name === "th")).map((cell) => inner(cell).trim())));
    else if (node.name === "table" || node.name === "thead" || node.name === "tbody" || node.name === "blockquote") walk(node.children, out);
    else if (node.name === "p") {
      const html = inner(node).trim();
      if (html !== "") out.push(block("paragraph", html));
    } else if (node.name === "br") continue;
    else out.push(block("paragraph", DomUtils.getOuterHTML(node).trim()));
  }
}

/** Word's "list" paragraphs arrive as plain paragraphs that start with a bullet character or a number; make them list items. */
function liftListMarks(blocks: readonly Block[]): Block[] {
  return blocks.map((entry) => {
    if (entry.kind !== "paragraph") return entry;
    if (BULLET.test(entry.text)) return block("item", entry.html.replace(BULLET, ""), 0, false);
    if (NUMBER.test(entry.text)) return block("item", entry.html.replace(NUMBER, ""), 0, true);
    return entry;
  });
}

/** The blocks of a clipboard paste. HTML is used when there is any; plain text is split by line. */
export function pasteToBlocks(paste: { readonly html?: string | undefined; readonly text?: string | undefined }): Block[] {
  const html = paste.html ?? "";
  if (/<(p|li|h[1-6]|tr|div|br)[\s>/]/i.test(html)) {
    // Word wraps lines in divs and spans; paragraphs and breaks are what matter.
    const prepared = html.replace(/<\/?(div|span|font|o:p)[^>]*>/gi, (tag) => (/^<\//.test(tag) && !/span|font/i.test(tag) ? "</p>" : /^<(div)/i.test(tag) ? "<p>" : ""));
    const out: Block[] = [];
    walk(parseDocument(cleanRich(prepared, { tables: true })).children, out);
    if (out.length > 0) return liftListMarks(out);
  }
  const lines = (paste.text ?? "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
  return liftListMarks(lines.map((line) => block("paragraph", line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))));
}

/** Items as nested lists: an item one level deeper than the one before it opens a list inside it, and the type of list (bullets or numbers) follows each item. */
function listHtml(items: readonly Block[]): string {
  let html = "";
  const stack: ("ul" | "ol")[] = [];
  for (const item of items) {
    const tag = item.ordered ? "ol" : "ul";
    // A list cannot start more than one level below the one it is in.
    const depth = Math.min(item.depth, stack.length);
    while (stack.length > depth + 1) html += `</li></${stack.pop()}>`;
    if (stack.length === depth + 1) {
      if (stack[depth] === tag) html += "</li>";
      else {
        html += `</li></${stack.pop()}><${tag}>`;
        stack.push(tag);
      }
    } else {
      html += `<${tag}>`;
      stack.push(tag);
    }
    html += `<li><p>${item.html}</p>`;
  }
  while (stack.length > 0) html += `</li></${stack.pop()}>`;
  return html;
}

/** The blocks as editor HTML: paragraphs, headings and lists (nested as they were), with consecutive items joined into one list. */
export function blocksToHtml(blocks: readonly Block[]): string {
  const parts: string[] = [];
  let items: Block[] = [];
  const close = () => {
    if (items.length > 0) parts.push(listHtml(items));
    items = [];
  };
  for (const entry of blocks) {
    if (entry.kind === "item") {
      items.push(entry);
      continue;
    }
    close();
    if (entry.kind === "heading") parts.push(`<h3>${entry.html}</h3>`);
    else if (entry.kind === "row") parts.push(`<p>${entry.cells.join(" | ")}</p>`);
    else parts.push(`<p>${entry.html}</p>`);
  }
  close();
  return cleanRich(parts.join(""));
}

const boldLine = (entry: Block): boolean => /^<strong>[\s\S]*<\/strong>$/.test(entry.html.trim()) && (entry.html.match(/<strong>/g) ?? []).length === 1;
/** A line that ends in a colon is a heading only when it is short ("Services:"). A whole sentence that leads into a list ("Share these when a prospect asks:") is body text. */
const HEADING_COLON_MAX = 48;
const looksLikeHeading = (entry: Block): boolean =>
  entry.kind === "heading" || (entry.kind === "paragraph" && entry.text.length <= 100 && (boldLine(entry) || (entry.text.endsWith(":") && entry.text.length <= HEADING_COLON_MAX)));

/** Removes a leading label such as "Q1." or "<strong>Answer</strong>:" from a block, whatever formatting wraps it. */
function stripLead(html: string, word: string): string {
  const tags = "(?:<(?:strong|em|u)>)*";
  const closing = "(?:</(?:strong|em|u)>)*";
  return cleanRich(html.replace(new RegExp(`^\\s*${tags}\\s*(?:${word})\\s*${closing}\\s*[:.)\\-\\u2013]\\s*${closing}\\s*`, "i"), ""));
}

export type QuestionItem = { readonly question: string; readonly answer: string };

const QUESTION_WORD = "q(?:uestion)?\\s*\\d*";
const ANSWER_WORD = "expected\\s+answer|ideal\\s+answer|answer|ans|a|expected|looking\\s+for";
const startsWith = (text: string, source: string): boolean => new RegExp(`^\\s*(?:${source})`, "i").test(text);
const hasLabel = (text: string, word: string): boolean => new RegExp(`^\\s*(?:${word})\\s*[:.)\\-\\u2013]`, "i").test(text);

/**
 * Questions with their expected answers. A table with a question column and an answer column is read row by row. Otherwise a question starts at a
 * numbered line, a "Q1." line, or a line ending in a question mark; whatever follows it (an "Answer:" line, sub-bullets, more paragraphs) is its answer.
 */
export function parseQuestions(blocks: readonly Block[]): QuestionItem[] {
  const rows = blocks.filter((entry) => entry.kind === "row" && entry.cells.length >= 2);
  if (rows.length > 0) {
    return rows
      .filter((row) => !/^(#|no\.?|s\.?\s?no\.?|sr\.?)$/i.test(richToText(row.cells[0] ?? "")) && !(startsWith(richToText(row.cells[0] ?? ""), "question") && startsWith(richToText(row.cells[1] ?? ""), "(?:expected|answer|ideal)")))
      .map((row) => {
        // A leading number column ("1" | question | answer) shifts the pair along.
        const numbered = /^\d{1,2}$/.test(richToText(row.cells[0] ?? "")) && row.cells.length >= 3;
        const [question = "", answer = ""] = numbered ? row.cells.slice(1) : row.cells;
        return { question: cleanRich(`<p>${question}</p>`), answer: cleanRich(`<p>${answer}</p>`) };
      })
      .filter((item) => richToText(item.question) !== "");
  }

  const found: { question: string; parts: Block[] }[] = [];
  for (const entry of blocks) {
    if (entry.kind === "heading" || entry.text === "") continue;
    const current = found.at(-1);
    const labelled = hasLabel(entry.text, QUESTION_WORD);
    const answerLabel = hasLabel(entry.text, ANSWER_WORD);
    const isQuestion =
      !answerLabel && (labelled || (entry.kind === "item" && entry.ordered && entry.depth === 0) || (entry.depth === 0 && entry.text.endsWith("?")) || (current === undefined && entry.kind === "item" && entry.depth === 0));
    if (current === undefined && !isQuestion && entry.text.endsWith(":")) continue; // an introduction line, not a question
    if (isQuestion || current === undefined) {
      found.push({ question: `<p>${labelled ? stripLead(entry.html, QUESTION_WORD) : entry.html}</p>`, parts: [] });
      continue;
    }
    current.parts.push(answerLabel ? block(entry.kind, stripLead(entry.html, ANSWER_WORD), entry.depth, entry.ordered) : entry);
  }
  return found.map((entry) => ({ question: cleanRich(entry.question), answer: blocksToHtml(entry.parts) })).filter((item) => richToText(item.question) !== "");
}

export type Section<K extends string> = { readonly key: K | null; readonly title: string; readonly html: string };

/**
 * Splits a document into sections by its headings. A heading is a heading style, a short bold line, a short line ending in a colon (a long sentence ending in one is body text), or any short
 * line that matches one of the field names asked for. Text before the first heading, and sections whose heading matches nothing, come back with a
 * null key so the person can say where they go.
 */
export function splitSections<K extends string>(blocks: readonly Block[], matchers: readonly { readonly key: K; readonly test: RegExp }[]): Section<K>[] {
  const match = (entry: Block): K | null => matchers.find((matcher) => matcher.test.test(entry.text))?.key ?? null;
  const sections: { key: K | null; title: string; blocks: Block[] }[] = [];
  for (const entry of blocks) {
    const key = entry.kind === "paragraph" || entry.kind === "heading" ? match(entry) : null;
    const heading = entry.kind !== "item" && entry.kind !== "row" && entry.text.length <= (entry.kind === "heading" ? 140 : 80) && (key !== null || looksLikeHeading(entry));
    if (heading) {
      sections.push({ key, title: entry.text.replace(/[:?]\s*$/, ""), blocks: [] });
      continue;
    }
    if (sections.length === 0) sections.push({ key: null, title: "", blocks: [] });
    sections.at(-1)?.blocks.push(entry);
  }
  return sections
    .map((section) => ({ key: section.key, title: section.title, html: blocksToHtml(section.blocks) }))
    .filter((section) => section.html !== "");
}

/** A short list of values from a pasted block: one per line or bullet, or separated by commas or semicolons. */
export function toValueList(html: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const line of richToText(html).split("\n")) {
    for (const piece of line.replace(BULLET, "").replace(NUMBER, "").split(/[,;]/)) {
      const value = piece.trim();
      if (value !== "" && !seen.has(value.toLowerCase())) {
        seen.add(value.toLowerCase());
        values.push(value);
      }
    }
  }
  return values;
}
