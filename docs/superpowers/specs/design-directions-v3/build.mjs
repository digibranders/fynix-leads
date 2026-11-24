// Builds the v3 comps: node docs/superpowers/specs/design-directions-v3/build.mjs
// Two directions x three client screens, as static HTML with real Phosphor icons (server-rendered).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as P from "@phosphor-icons/react/dist/ssr";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Phosphor icon as an inline SVG string. Throws on an unknown name so a typo never ships as a blank. */
function ic(name, size = 16, weight = "regular") {
  const Icon = P[name];
  if (!Icon) throw new Error(`Unknown Phosphor icon: ${name}`);
  return renderToStaticMarkup(createElement(Icon, { size, weight, "aria-hidden": true, className: "ic" }));
}

/* ---------------------------------------------------------------- shared sample data (Halden Foods client portal) */

const STAGES = {
  awaiting: { label: "Awaiting client", cls: "s-awaiting" },
  scheduled: { label: "Scheduled", cls: "s-scheduled" },
  due: { label: "Outcome due", cls: "s-due" },
  disputed: { label: "Disputed", cls: "s-disputed" },
  delivered: { label: "Delivered", cls: "s-delivered" },
  declined: { label: "Declined", cls: "s-declined" },
};

const LEADS = [
  { ref: "LD-3K7M", name: "Marta Lindqvist", title: "Head of Logistics", company: "Nordvik Cold Chain", stage: "awaiting", meeting: "Not scheduled", sub: "22 Nov" },
  { ref: "LD-5P2R", name: "Owen Pritchard", title: "Procurement Director", company: "Dalefield Foods", stage: "awaiting", meeting: "Not scheduled", sub: "21 Nov" },
  { ref: "LD-8T4V", name: "Ingrid Sørensen", title: "VP Supply Chain", company: "Fjordline Distribution", stage: "scheduled", meeting: "26 Nov, 16:30", sub: "18 Nov" },
  { ref: "LD-9M6X", name: "Callum Reid", title: "Operations Manager", company: "Tarnbrook Grocers", stage: "scheduled", meeting: "29 Nov, 17:30", sub: "17 Nov" },
  { ref: "LD-2A8Z", name: "Hanneke de Vries", title: "Supply Planning Lead", company: "Zeeland Frozen Goods", stage: "due", meeting: "22 Nov, 15:30", sub: "14 Nov" },
  { ref: "LD-1H5J", name: "Lars Eriksen", title: "COO", company: "Kattegat Freight", stage: "disputed", meeting: "20 Nov, 19:30", sub: "11 Nov" },
  { ref: "LD-4B9C", name: "Priya Raman", title: "Director of Distribution", company: "Greenfield Markets", stage: "delivered", meeting: "18 Nov, 17:30", sub: "09 Nov" },
  { ref: "LD-6D1E", name: "Tomasz Wrona", title: "Head of Procurement", company: "Baltic Cold Storage", stage: "delivered", meeting: "14 Nov, 17:30", sub: "05 Nov" },
  { ref: "LD-7F3G", name: "Siobhan Keane", title: "Category Manager", company: "Harrowgate Retail", stage: "declined", meeting: "Not scheduled", sub: "15 Nov" },
];

const COUNTS = { all: 50, awaiting: 2, scheduled: 4, due: 3, delivered: 31, disputed: 1, declined: 9 };

const MARTA = {
  ...LEADS[0],
  domain: "nordvikcold.example",
  bant: [
    ["Budget", "Confirmed for this financial year"],
    ["Authority", "Signs off supply contracts above 50k"],
    ["Need", "Replacing a manual ordering process"],
    ["Timeline", "Decision within one quarter"],
  ],
  note: "Replied to the second outreach and asked for a short call.",
  times: [
    { day: "Fri 27 Nov", time: "15:30", zone: "GMT" },
    { day: "Sat 28 Nov", time: "19:30", zone: "GMT" },
    { day: "Mon 30 Nov", time: "16:30", zone: "GMT" },
  ],
};

const MONTHS = [
  ["Jun", 31],
  ["Jul", 38],
  ["Aug", 44],
  ["Sep", 47],
  ["Oct", 41],
  ["Nov", 31],
];

const initials = (name) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const badge = (stage) => `<span class="badge ${STAGES[stage].cls}">${STAGES[stage].label}</span>`;
const chip = (ref) => `<span class="ref">${ref}</span>`;
const av = (name, cls = "") => `<span class="av ${cls}">${initials(name)}</span>`;

/* ---------------------------------------------------------------- shell */

const NAV_FLAT = [
  ["House", "Overview", null],
  ["Megaphone", "Campaigns", null],
  ["Tray", "To respond", 2],
  ["Table", "Leads", null],
  ["CalendarBlank", "Meetings", null],
  ["UsersThree", "Hosts & hours", null],
  ["Handshake", "Agreement", null],
  ["ChatsCircle", "Messages", 3],
];

const NAV_GROUPED = [
  ["Work", [["House", "Overview", null], ["Tray", "To respond", 2], ["Table", "Leads", null], ["CalendarBlank", "Meetings", null], ["ChatsCircle", "Messages", 3]]],
  ["Campaign", [["Megaphone", "Campaigns", null], ["UsersThree", "Hosts & hours", null], ["Handshake", "Agreement", null]]],
];

function navItem([icon, label, count], active) {
  const cls = `nav-a${label === active ? " on" : ""}`;
  return `<a class="${cls}">${ic(icon, 17)}<span>${label}</span>${count ? `<b class="cnt">${count}</b>` : ""}</a>`;
}

function sidebar(dir, active) {
  const brand = `<div class="brand"><span class="logo">${ic("Funnel", 15, "fill")}</span><span class="brand-t"><b>Fynix Leads</b><i>Client portal</i></span></div>`;
  const foot = `<div class="side-foot"><button class="who">${av("Priya Menon", "av-me")}<span class="who-t"><b>Priya Menon</b><i>Client manager</i></span>${ic("CaretUpDown", 14)}</button></div>`;
  if (dir === "a") {
    return `<aside class="side">${brand}<nav class="nav">${NAV_FLAT.map((n) => navItem(n, active)).join("")}</nav>${foot}</aside>`;
  }
  const org = `<div class="org"><span class="org-m">HF</span><span class="org-t"><b>Halden Foods</b><i>Cold chain, UK and Ireland</i></span>${ic("CaretUpDown", 14)}</div>`;
  const groups = NAV_GROUPED.map(([g, items]) => `<div class="nav-g"><p>${g}</p>${items.map((n) => navItem(n, active)).join("")}</div>`).join("");
  return `<aside class="side">${brand}${org}<nav class="nav">${groups}</nav>${foot}</aside>`;
}

function topbar(dir, crumb) {
  const crumbHtml = crumb.map((c, i) => (i === crumb.length - 1 ? `<b>${c}</b>` : `<span>${c}</span>${ic("CaretRight", 11)}`)).join("");
  return `<header class="top"><div class="crumb">${crumbHtml}</div>
    <button class="search">${ic("MagnifyingGlass", 15)}<span>Search leads and pages</span><kbd>⌘K</kbd></button>
    <div class="top-r"><button class="ibtn" aria-label="Help">${ic("Question", 17)}</button><button class="ibtn" aria-label="Notifications">${ic("Bell", 17)}<i class="ping"></i></button></div></header>`;
}

function page(dir, title, active, crumb, body, extra = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="tokens.css"></head>
  <body class="d-${dir}"><div class="app">${sidebar(dir, active)}<div class="main">${topbar(dir, crumb)}<main class="content">${body}</main></div></div>${extra}</body></html>`;
}

const head = (title, sub, actions = "") =>
  `<div class="head"><div><h1>${title}</h1><p>${sub}</p></div><div class="head-a">${actions}</div></div>`;
const btn = (label, kind = "s", icon = "") => `<button class="btn btn-${kind}">${icon ? ic(icon, 15) : ""}${label}</button>`;

/* ---------------------------------------------------------------- shared pieces */

const spark = (pts, color = "currentColor") => {
  const w = 84, h = 28, max = Math.max(...pts), min = Math.min(...pts);
  const xy = pts.map((v, i) => `${((i / (pts.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / (max - min || 1)) * (h - 6)).toFixed(1)}`).join(" ");
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${xy}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
};

const bars = () => {
  const max = 50, plot = 140, labels = 26; // px: plot height, room under the bars for the month label
  return `<div class="bars" role="img" aria-label="Delivered leads by month against a target of 50">
    <div class="bars-target" style="bottom:${plot + labels}px"><span>Target 50</span></div>
    ${MONTHS.map(([m, v], i) => `<div class="bar-c"><span class="bar-v">${v}</span><i class="bar${i === MONTHS.length - 1 ? " now" : ""}" style="height:${(v / max) * plot}px"></i><span class="bar-m">${m}</span></div>`).join("")}</div>`;
};

const meetingRows = [
  ["26", "Nov", "Ingrid Sørensen", "Fjordline Distribution", "16:30 GMT"],
  ["29", "Nov", "Callum Reid", "Tarnbrook Grocers", "17:30 GMT"],
  ["02", "Dec", "Elin Haugen", "Nordhavn Provisions", "15:00 GMT"],
  ["04", "Dec", "Rhys Colbourne", "Lowmoor Dairy", "10:30 GMT"],
];

/* ---------------------------------------------------------------- A: Ledger (faithful translation) */

function aOverview() {
  const kpis = [
    ["Delivered this month", `31<small> of 50</small>`, `<div class="meter"><i style="width:62%"></i></div><span>62% of target, 6 days left</span>`],
    ["Awaiting your response", "2", "<span>Oldest submitted 2 days ago</span>"],
    ["Meetings scheduled", "4", "<span>Next: 26 Nov, 16:30</span>"],
    ["Outcome due", "3", "<span>Oldest: 22 Nov</span>"],
    ["Disputes", "1", "<span>Under review by Fynix</span>"],
  ]
    .map(([l, v, f]) => `<div class="kpi"><span class="kpi-l">${l}</span><span class="kpi-v">${v}</span><div class="kpi-f">${f}</div></div>`)
    .join("");

  const respond = LEADS.slice(0, 2)
    .map((l) => `<tr><td>${chip(l.ref)}</td><td><div class="cell-p">${av(l.name)}<span><b>${l.name}</b><i>${l.title}</i></span></div></td><td>${l.company}</td><td class="mut">${l.sub}</td><td class="r">${btn("Review", "s")}</td></tr>`)
    .join("");

  const meetings = meetingRows
    .map(([d, m, n, c, t]) => `<li><span class="date"><b>${d}</b><i>${m}</i></span><span class="li-t"><b>${n}</b><i>${c}</i></span><span class="mut">${t}</span></li>`)
    .join("");

  const activity = [
    ["Lead delivered", "Priya Raman, Greenfield Markets", "2 days ago"],
    ["Lead submitted", "Marta Lindqvist, Nordvik Cold Chain", "2 days ago"],
    ["Dispute under review", "LD-1H5J, Kattegat Freight", "4 days ago"],
    ["Meeting scheduled", "Ingrid Sørensen, Fjordline Distribution", "5 days ago"],
  ]
    .map(([a, b, t]) => `<li><span class="li-t"><b>${a}</b><i>${b}</i></span><span class="mut">${t}</span></li>`)
    .join("");

  const body = `${head("Overview", "Halden Foods, cold chain UK and Ireland. November 2026.", btn("Export report", "s", "DownloadSimple") + btn("Review 2 leads", "p", "Tray"))}
  <section class="card kpis">${kpis}</section>
  <div class="grid12">
    <section class="card c8"><div class="card-h"><h2>Needs your response <em>2</em></h2><a class="link">Open queue ${ic("ArrowRight", 13)}</a></div>
      <table class="tbl"><thead><tr><th>Reference</th><th>Prospect</th><th>Company</th><th>Submitted</th><th></th></tr></thead><tbody>${respond}</tbody></table></section>
    <section class="card c4"><div class="card-h"><h2>Upcoming meetings</h2><a class="link">Calendar</a></div><ul class="list">${meetings}</ul></section>
    <section class="card c8"><div class="card-h"><h2>Delivered by month</h2><span class="mut">Target 50 a month</span></div><div class="card-b">${bars()}</div></section>
    <section class="card c4"><div class="card-h"><h2>Recent activity</h2></div><ul class="list">${activity}</ul></section>
  </div>`;
  return page("a", "Overview | Fynix Leads", "Overview", ["Halden Foods", "Overview"], body);
}

function aRespond() {
  const rows = LEADS.slice(0, 2)
    .map(
      (l, i) => `<tr class="${i === 0 ? "sel" : ""}"><td>${chip(l.ref)}</td><td><div class="cell-p">${av(l.name)}<span><b>${l.name}</b><i>${l.title}</i></span></div></td><td>${l.company}</td>
      <td><span class="tag">Budget confirmed</span><span class="tag">Authority 50k+</span><span class="tag more">+2</span></td><td class="mut">${l.sub}</td><td class="mut">3 times offered</td><td class="r">${btn("Review", "s")}</td></tr>`,
    )
    .join("");
  const body = `${head("To respond", "Review qualified prospects and confirm a meeting time.")}
  <section class="card clip">
    <div class="tabs"><button class="tab on">Awaiting you<span class="cnt-t">2</span></button><button class="tab">Responded<span class="cnt-t">48</span></button></div>
    <div class="toolbar"><div class="filters"><label class="finput">${ic("MagnifyingGlass", 14)}<input placeholder="Search by name or company" aria-label="Search"></label><button class="fsel">Oldest first${ic("CaretDown", 12)}</button></div><span class="mut">2 shown</span></div>
    <table class="tbl"><thead><tr><th>Reference</th><th>Prospect</th><th>Company</th><th>Qualification</th><th>Submitted</th><th>Offered</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;

  const drawer = `<div class="scrim"></div><aside class="drawer" role="dialog" aria-label="Lead LD-3K7M">
    <div class="dr-h"><div>${chip(MARTA.ref)} ${badge("awaiting")}<h2>${MARTA.name}</h2><p>${MARTA.title}, ${MARTA.company}</p></div><button class="ibtn" aria-label="Close">${ic("X", 17)}</button></div>
    <div class="dr-b">
      <h3>Qualification</h3><dl class="dl">${MARTA.bant.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      <h3>Note</h3><p class="note">${MARTA.note}</p>
      <h3>Choose a meeting time</h3>
      <div class="opts">${MARTA.times.map((t, i) => `<button class="opt${i === 1 ? " on" : ""}"><span class="radio"></span><span><b>${t.day}</b><i>${t.time} ${t.zone}</i></span>${i === 1 ? `<span class="mut">Inside your hours</span>` : ""}</button>`).join("")}</div>
    </div>
    <div class="dr-f"><button class="btn btn-d">${ic("X", 14)}Decline lead</button><span class="sp"></span><button class="btn btn-p">${ic("Check", 14)}Accept Sat 28 Nov, 19:30</button></div></aside>`;
  return page("a", "To respond | Fynix Leads", "To respond", ["Halden Foods", "To respond"], body, drawer);
}

function leadsTable(dir) {
  const rows = LEADS.map(
    (l) => `<tr><td>${chip(l.ref)}</td><td><div class="cell-p">${av(l.name)}<span><b>${l.name}</b><i>${l.title}</i></span></div></td><td>${l.company}</td><td>${badge(l.stage)}</td><td class="${l.meeting === "Not scheduled" ? "mut" : ""}">${l.meeting}</td><td class="mut">${l.sub}</td><td class="r"><button class="ibtn" aria-label="Actions for ${l.name}">${ic("DotsThree", 18, "bold")}</button></td></tr>`,
  ).join("");
  const table = `<table class="tbl"><thead><tr><th>Reference</th><th>Prospect</th><th>Company</th><th>Stage</th><th>Meeting</th><th>Submitted</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <div class="pager"><span class="mut">Showing 1 to 9 of 50</span><div class="pager-b">${btn("Previous", "s")}${btn("Next", "s")}</div></div>`;
  return table;
}

function aLeads() {
  const tabs = [["All", COUNTS.all, true], ["Awaiting", COUNTS.awaiting], ["Scheduled", COUNTS.scheduled], ["Outcome due", COUNTS.due], ["Delivered", COUNTS.delivered], ["Disputed", COUNTS.disputed], ["Declined", COUNTS.declined]]
    .map(([l, c, on]) => `<button class="tab${on ? " on" : ""}">${l}<span class="cnt-t">${c}</span></button>`)
    .join("");
  const body = `${head("Leads", "Every prospect submitted for this campaign, across all stages.", btn("Export CSV", "s", "DownloadSimple"))}
  <section class="card clip"><div class="tabs">${tabs}</div>
    <div class="toolbar"><div class="filters"><label class="finput">${ic("MagnifyingGlass", 14)}<input placeholder="Search by name, company or reference" aria-label="Search"></label><button class="fsel">Meeting date${ic("CaretDown", 12)}</button><button class="fsel">Submitted${ic("CaretDown", 12)}</button></div><span class="mut">50 leads</span></div>
    ${leadsTable("a")}</section>`;
  return page("a", "Leads | Fynix Leads", "Leads", ["Halden Foods", "Leads"], body);
}

/* ---------------------------------------------------------------- B: Ledger Soft (Fynix variant) */

function bOverview() {
  const hero = `<section class="hero"><div class="hero-l"><span class="hero-k">Needs your response</span><h2>2 leads are waiting for you</h2><p>The oldest was submitted 2 days ago, from Nordvik Cold Chain.</p>
      <div class="hero-a"><button class="btn btn-peach">${ic("Tray", 15)}Start reviewing</button><button class="btn btn-onnavy">All leads</button></div></div>
    <div class="hero-r"><span class="hero-k">Delivered this month</span><div class="hero-n">31<small> / 50</small></div><div class="hmeter"><i style="width:62%"></i></div><p>19 to go, 6 days left</p></div></section>`;
  const mini = (label, value, foot, pts, color) =>
    `<section class="card mini"><div><span class="kpi-l">${label}</span><div class="kpi-v">${value}</div><span class="mut">${foot}</span></div>${spark(pts, color)}</section>`;
  const meetings = meetingRows
    .map(([d, m, n, c, t], i) => `<li class="${i === 0 ? "next" : ""}"><span class="date"><b>${d}</b><i>${m}</i></span><span class="li-t"><b>${n}</b><i>${c}</i></span><span class="mut">${t}</span></li>`)
    .join("");
  const body = `${head("Overview", "Halden Foods, cold chain UK and Ireland. November 2026.", btn("Export report", "s", "DownloadSimple"))}
  ${hero}
  <div class="grid3">${mini("Meetings scheduled", "4", "Next: 26 Nov, 16:30", [2, 3, 3, 5, 4, 6, 4], "#3B7BD0")}${mini("Outcome due", "3", "Oldest: 22 Nov", [1, 0, 2, 1, 3, 2, 3], "#2A9D9D")}${mini("Disputes", "1", "Under review by Fynix", [0, 0, 1, 0, 0, 1, 1], "#D4483D")}</div>
  <div class="grid12">
    <section class="card c7"><div class="card-h"><h2>Delivered by month</h2><span class="mut">Target 50 a month</span></div><div class="card-b">${bars()}</div></section>
    <section class="card c5"><div class="card-h"><h2>Upcoming meetings</h2><a class="link">Calendar</a></div><ul class="list tl">${meetings}</ul></section>
  </div>`;
  return page("b", "Overview | Fynix Leads", "Overview", ["Overview"], body);
}

function bRespond() {
  const list = LEADS.slice(0, 2)
    .map(
      (l, i) => `<button class="q-i${i === 0 ? " on" : ""}">${av(l.name)}<span class="q-t"><b>${l.name}</b><i>${l.company}</i></span><span class="q-m"><i>${l.sub}</i><em>3 times</em></span></button>`,
    )
    .join("");
  const slots = MARTA.times
    .map((t, i) => `<button class="slot${i === 1 ? " on" : ""}"><span class="slot-d">${t.day}</span><span class="slot-t">${t.time}</span><span class="slot-z">${t.zone}</span>${i === 1 ? `<span class="slot-c">${ic("CheckCircle", 16, "fill")}</span>` : ""}</button>`)
    .join("");
  const body = `${head("To respond", "2 leads need your answer. Pick a time to accept, or decline.")}
  <div class="split">
    <section class="card q"><div class="q-h"><label class="finput">${ic("MagnifyingGlass", 14)}<input placeholder="Search" aria-label="Search"></label></div><div class="q-l">${list}</div><div class="q-f"><kbd>J</kbd><kbd>K</kbd> move <span class="sp"></span><kbd>A</kbd> accept <kbd>D</kbd> decline</div></section>
    <section class="card rec">
      <div class="rec-h"><div class="rec-id">${av(MARTA.name, "av-lg")}<div><h2>${MARTA.name}</h2><p>${MARTA.title}, ${MARTA.company}</p></div></div><div class="rec-m">${chip(MARTA.ref)}${badge("awaiting")}<span class="mut">Submitted 22 Nov</span></div></div>
      <div class="rec-b">
        <div class="facts">${MARTA.bant.map(([k, v]) => `<div class="fact"><span>${k}</span><b>${v}</b></div>`).join("")}</div>
        <div class="quote"><span>Note</span><p>${MARTA.note}</p></div>
        <h3>Choose a meeting time</h3><div class="slots">${slots}</div>
      </div>
      <div class="rec-f"><button class="btn btn-ghostd">Decline lead</button><span class="sp"></span><span class="mut">Sat 28 Nov, 19:30 GMT</span><button class="btn btn-p btn-lg">${ic("Check", 15)}Accept this time</button></div>
    </section>
  </div>`;
  return page("b", "To respond | Fynix Leads", "To respond", ["To respond"], body);
}

function bLeads() {
  const seg = [["delivered", 31], ["declined", 9], ["scheduled", 4], ["due", 3], ["awaiting", 2], ["disputed", 1]];
  const bar = seg.map(([s, n]) => `<i class="p-${s}" style="flex:${n}" title="${STAGES[s].label} ${n}"></i>`).join("");
  const legend = [["All", 50, null, true], ...seg.map(([s, n]) => [STAGES[s].label, n, s])]
    .map(([l, n, s, on]) => `<button class="pill${on ? " on" : ""}">${s ? `<i class="sw p-${s}"></i>` : ""}${l}<b>${n}</b></button>`)
    .join("");
  const body = `${head("Leads", "Every prospect submitted for this campaign, across all stages.", btn("Export CSV", "s", "DownloadSimple"))}
  <section class="card pipe"><div class="pipe-bar">${bar}</div><div class="pipe-l">${legend}</div></section>
  <section class="card clip">
    <div class="toolbar"><div class="filters"><label class="finput">${ic("MagnifyingGlass", 14)}<input placeholder="Search by name, company or reference" aria-label="Search"></label><button class="fsel">Meeting date${ic("CaretDown", 12)}</button><button class="fsel">Submitted${ic("CaretDown", 12)}</button></div><span class="mut">50 leads</span></div>
    ${leadsTable("b")}</section>`;
  return page("b", "Leads | Fynix Leads", "Leads", ["Leads"], body);
}

/* ---------------------------------------------------------------- write */

const out = {
  "a-ledger": { "overview.html": aOverview(), "respond.html": aRespond(), "leads.html": aLeads() },
  "b-ledger-soft": { "overview.html": bOverview(), "respond.html": bRespond(), "leads.html": bLeads() },
};
for (const [dir, files] of Object.entries(out)) {
  mkdirSync(join(here, dir), { recursive: true });
  for (const [name, html] of Object.entries(files)) writeFileSync(join(here, dir, name), html);
}
console.log("comps written");
