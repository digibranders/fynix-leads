// Builds the mobile comps: node docs/superpowers/specs/design-directions-v4-mobile/build.mjs
// Two glass tab bar directions (A Frost, B Ink) x three client screens, static HTML with real Phosphor icons.
// Glass is a web approximation: backdrop-filter, a layered highlight and a 1px ring, never an outline.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as P from "@phosphor-icons/react/dist/ssr";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
function ic(name, size = 20, weight = "regular") {
  const Icon = P[name];
  if (!Icon) throw new Error(`Unknown Phosphor icon: ${name}`);
  return renderToStaticMarkup(createElement(Icon, { size, weight, "aria-hidden": true, className: "ic" }));
}

const LEADS = [
  ["MT", "Marta Lindqvist", "Nordvik Cold Chain", "awaiting", "Awaiting you", "Not scheduled"],
  ["OP", "Owen Pritchard", "Dalefield Foods", "awaiting", "Awaiting you", "Not scheduled"],
  ["IS", "Ingrid Sorensen", "Fjordline Distribution", "scheduled", "Scheduled", "Thu 26 Nov, 4:30 pm"],
  ["CR", "Callum Reid", "Tarnbrook Grocers", "scheduled", "Scheduled", "Sun 29 Nov, 5:30 pm"],
  ["HV", "Hanneke de Vries", "Zeeland Frozen Goods", "due", "Outcome due", "Sun 22 Nov, 3:30 pm"],
  ["LE", "Lars Eriksen", "Kattegat Freight", "disputed", "Disputed", "Fri 20 Nov, 7:30 pm"],
  ["PR", "Priya Raman", "Greenfield Markets", "delivered", "Delivered", "Wed 18 Nov, 5:30 pm"],
];

const TABS = [
  ["House", "Home", "on"],
  ["Tray", "To respond", "", 2],
  ["Table", "Leads"],
  ["CalendarBlank", "Meetings"],
  ["DotsThreeOutline", "More"],
];

function tabbar(active) {
  return `<nav class="tabbar" aria-label="Main">${TABS.map(([icon, label, , badge], i) => {
    const on = i === active;
    return `<a class="tab${on ? " on" : ""}">${ic(icon, 24, on ? "fill" : "regular")}${badge ? `<b class="badge">${badge}</b>` : ""}<span>${label}</span></a>`;
  }).join("")}</nav><i class="home-ind"></i>`;
}

const status = `<div class="status"><span>9:41</span><span class="island"></span><span class="sys">${ic("CellSignalFull", 15, "fill")}${ic("WifiHigh", 15, "bold")}${ic("BatteryFull", 22, "fill")}</span></div>`;

function leadRow([ini, name, co, cls, stage, when]) {
  return `<div class="lrow"><span class="av">${ini}</span><span class="lt"><b>${name}</b><i>${co}</i><em>${when}</em></span><span class="chip ${cls}">${stage}</span></div>`;
}

function overview() {
  return `<div class="screen"><div class="scroll">
    <div class="pad-top"></div>
    <header class="large"><div><h1>Overview</h1><p>Where every campaign stands today.</p></div><span class="avatar">DC</span></header>
    <section class="hero"><span class="kick">Needs your response</span><h2>2 leads are waiting for you</h2><p>Choose a meeting time or decline. Each one takes under a minute.</p><button class="cta">${ic("Tray", 18, "bold")}Review leads</button>
      <div class="hero-foot"><span><small>Delivered so far</small><b>2</b></span><span><small>Monthly target</small><b>90</b></span></div></section>
    <div class="two"><div class="mini"><small>Active campaigns</small><b>1</b><i>of 5 in all</i></div><div class="mini"><small>Meetings booked</small><b>2</b><i>Next: Thu 4:30 pm</i></div></div>
    <div class="pipe"><i style="flex:9;background:#C98A16"></i><i style="flex:4;background:#2F6FBB"></i><i style="flex:2;background:#1F8A82"></i><i style="flex:31;background:#2E8B57"></i><i style="flex:1;background:#C0453A"></i><i style="flex:3;background:#6B7783"></i></div>
    <h3 class="sec">Recent leads</h3>
    <div class="list">${LEADS.slice(0, 6).map(leadRow).join("")}</div>
  </div>
  <div class="glass-top"></div>${status}${tabbar(0)}</div>`;
}

function leads() {
  return `<div class="screen"><div class="scroll" style="transform:translateY(-62px)">
    <div class="pad-top"></div>
    <header class="large"><div><h1>Leads</h1><p>Every prospect, from submission to delivery.</p></div></header>
    <label class="search">${ic("MagnifyingGlass", 17)}<span>Search name, company or reference</span></label>
    <div class="chips"><span class="fc on">All 9</span><span class="fc"><i style="background:#C98A16"></i>Awaiting 2</span><span class="fc"><i style="background:#2F6FBB"></i>Scheduled 2</span><span class="fc"><i style="background:#1F8A82"></i>Outcome due 1</span><span class="fc"><i style="background:#2E8B57"></i>Delivered 2</span></div>
    <div class="list">${LEADS.concat(LEADS.slice(0, 3)).map(leadRow).join("")}</div>
  </div>
  <div class="glass-top solid"><span class="compact">Leads</span></div>${status}${tabbar(2)}</div>`;
}

const GROUPS = [
  ["Work", [["ChatsCircle", "Messages"]]],
  ["Campaign", [["Megaphone", "Campaigns"], ["UsersThree", "Hosts and hours"], ["Handshake", "Agreement"]]],
];

function more() {
  return `<div class="screen">${overview().replace(/^<div class="screen">/, "").replace(/<\/div>$/, "")}
    <div class="scrim"></div>
    <div class="sheet"><i class="grab"></i>
      <label class="search sheet-search">${ic("MagnifyingGlass", 17)}<span>Search pages</span></label>
      <div class="who"><span class="avatar big">DC</span><span class="wt"><b>Dev Client</b><i>Halden Foods Ltd, Client portal</i></span><button class="out">${ic("SignOut", 17, "bold")}Sign out</button></div>
      ${GROUPS.map(([g, rows]) => `<h4>${g}</h4><div class="group">${rows.map(([i, l]) => `<div class="grow"><span class="tile">${ic(i, 19, "fill")}</span><b>${l}</b>${ic("CaretRight", 15, "bold")}</div>`).join("")}</div>`).join("")}
    </div>
  </div>`;
}

const CSS = (v) => `
*{box-sizing:border-box;margin:0}
body{font-family:"Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:radial-gradient(1200px 700px at 50% -10%,#efe9df,#d9d4ca);color:#0c1e2e;padding:40px 36px 28px;-webkit-font-smoothing:antialiased}
.board{display:flex;gap:44px;justify-content:center}
.cap{text-align:center;margin-top:18px;font-size:13px;font-weight:600;color:#3f4d59}
.title{text-align:center;margin-bottom:30px}.title h1{font-size:22px;letter-spacing:-.02em}.title p{margin-top:6px;font-size:13.5px;color:#56626d}
.phone{width:390px;height:844px;border-radius:54px;position:relative;overflow:hidden;background:#F4F2EE;box-shadow:0 0 0 11px #11161b,0 0 0 12px #3a444d,0 40px 80px -24px rgba(12,30,46,.45)}
.screen{position:absolute;inset:0;overflow:hidden}
.scroll{position:absolute;inset:0 0 auto 0;padding:0 18px 140px}
.pad-top{height:58px}
.status{position:absolute;top:0;left:0;right:0;height:54px;display:flex;align-items:center;justify-content:space-between;padding:6px 34px 0 38px;font-size:16px;font-weight:700;z-index:30}
.island{position:absolute;left:50%;top:11px;width:118px;height:34px;margin-left:-59px;border-radius:20px;background:#07090b}
.sys{display:flex;gap:5px;align-items:center}.sys .ic{display:block}
.glass-top{position:absolute;top:0;left:0;right:0;height:92px;z-index:20;pointer-events:none;background:linear-gradient(180deg,rgba(244,242,238,.9),rgba(244,242,238,0));}
.glass-top.solid{background:rgba(244,242,238,.62);-webkit-backdrop-filter:blur(22px) saturate(180%);backdrop-filter:blur(22px) saturate(180%);box-shadow:0 1px 0 rgba(12,30,46,.06),0 8px 24px -12px rgba(12,30,46,.18)}
.compact{position:absolute;left:0;right:0;top:56px;text-align:center;font-size:16.5px;font-weight:700}
.large{display:flex;justify-content:space-between;align-items:flex-end;margin:6px 0 16px}
.large h1{font-size:34px;letter-spacing:-.035em;line-height:1.05;font-weight:700}.large p{margin-top:6px;font-size:14px;color:#56626d}
.avatar{width:40px;height:40px;border-radius:50%;background:#0c1e2e;color:#E9AF88;display:grid;place-items:center;font-size:13px;font-weight:700;box-shadow:0 0 0 3px rgba(255,255,255,.7),0 6px 14px -4px rgba(12,30,46,.4)}
.avatar.big{width:46px;height:46px;font-size:14px}
.hero{background:radial-gradient(120% 120% at 100% 0%,#17364f,#0c1e2e 60%);color:#F4F2EE;border-radius:24px;padding:20px 20px 16px;box-shadow:0 18px 36px -16px rgba(12,30,46,.6)}
.kick{font-size:12px;font-weight:700;color:#E9AF88;letter-spacing:.01em}.hero h2{font-size:25px;line-height:1.12;letter-spacing:-.025em;margin:8px 0 8px;font-weight:700}
.hero p{font-size:14px;line-height:1.45;color:rgba(244,242,238,.72)}
.cta{margin-top:16px;height:46px;width:100%;border:0;border-radius:15px;background:#E9AF88;color:#0c1e2e;font:700 15px/1 inherit;display:flex;gap:8px;align-items:center;justify-content:center;box-shadow:0 6px 16px -6px rgba(233,175,136,.7)}
.hero-foot{display:flex;gap:30px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.1)}
.hero-foot small{display:block;font-size:11.5px;color:rgba(244,242,238,.6)}.hero-foot b{font-size:21px;letter-spacing:-.02em}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
.mini{background:#fff;border-radius:20px;padding:15px 16px;box-shadow:0 1px 2px rgba(12,30,46,.05),0 0 0 1px rgba(12,30,46,.035)}
.mini small{display:block;font-size:12px;color:#56626d;font-weight:600}.mini b{display:block;font-size:28px;letter-spacing:-.03em;margin:4px 0 2px}.mini i{font-style:normal;font-size:12px;color:#56626d}
.pipe{display:flex;gap:3px;height:9px;margin:16px 4px 4px}.pipe i{border-radius:5px;min-width:6px}
.sec{font-size:19px;letter-spacing:-.02em;margin:22px 2px 10px}
.list{display:flex;flex-direction:column;gap:10px}
.lrow{display:flex;align-items:center;gap:12px;background:#fff;border-radius:20px;padding:13px 14px;box-shadow:0 1px 2px rgba(12,30,46,.05),0 0 0 1px rgba(12,30,46,.035)}
.av{flex:none;width:42px;height:42px;border-radius:14px;background:rgba(12,30,46,.06);display:grid;place-items:center;font-size:13px;font-weight:700;color:#3f4d59}
.lt{flex:1;min-width:0}.lt b{display:block;font-size:15px;letter-spacing:-.01em}.lt i{display:block;font-style:normal;font-size:12.5px;color:#56626d;margin-top:1px}.lt em{display:block;font-style:normal;font-size:12px;color:#56626d;margin-top:3px;font-variant-numeric:tabular-nums}
.chip{flex:none;font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:999px;align-self:flex-start}
.awaiting{background:#FBEFD5;color:#7A4E08}.scheduled{background:#E3EEFB;color:#1B5599}.due{background:#DDF1EF;color:#14605A}.disputed{background:#FBE4E1;color:#9B2D25}.delivered{background:#E0F3E7;color:#1A6238}
.search{display:flex;align-items:center;gap:9px;height:44px;padding:0 14px;border-radius:14px;background:rgba(12,30,46,.06);color:#56626d;font-size:15px;margin-bottom:12px}
.chips{display:flex;gap:8px;margin:0 -18px 14px;padding:0 18px;overflow:hidden}
.fc{flex:none;display:flex;align-items:center;gap:7px;height:36px;padding:0 14px;border-radius:999px;background:#fff;font-size:13.5px;font-weight:600;box-shadow:0 1px 2px rgba(12,30,46,.05),0 0 0 1px rgba(12,30,46,.035)}
.fc i{width:8px;height:8px;border-radius:50%}.fc.on{background:#0c1e2e;color:#F4F2EE}
.tabbar{position:absolute;left:14px;right:14px;bottom:26px;height:70px;border-radius:35px;padding:5px;display:grid;grid-template-columns:repeat(5,1fr);gap:2px;z-index:40}
.tab{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:30px;font-size:10px;font-weight:650;letter-spacing:0}
.tab .ic{display:block}
.badge{position:absolute;top:6px;left:calc(50% + 6px);min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#E9AF88;color:#0c1e2e;font-size:11px;font-weight:800;display:grid;place-items:center;font-style:normal}
.home-ind{position:absolute;bottom:8px;left:50%;width:138px;height:5px;margin-left:-69px;border-radius:3px;z-index:41}
.scrim{position:absolute;inset:0;background:rgba(12,30,46,.38);z-index:50}
.sheet{position:absolute;left:0;right:0;bottom:0;height:600px;border-radius:34px 34px 0 0;padding:10px 18px 0;z-index:60}
.grab{display:block;width:40px;height:5px;border-radius:3px;margin:0 auto 14px}
.sheet-search{margin-bottom:14px}
.who{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:20px;margin-bottom:6px}
.wt{flex:1;min-width:0}.wt b{display:block;font-size:16px}.wt i{display:block;font-style:normal;font-size:12.5px;margin-top:2px}
.out{display:flex;align-items:center;gap:6px;height:36px;padding:0 13px;border:0;border-radius:12px;font:650 13px/1 inherit}
.sheet h4{font-size:12.5px;font-weight:700;letter-spacing:.01em;margin:16px 6px 8px}
.group{border-radius:20px;overflow:hidden}
.grow{display:flex;align-items:center;gap:13px;height:56px;padding:0 14px}
.grow b{flex:1;font-size:16px;font-weight:600;letter-spacing:-.01em}
.grow+.grow{box-shadow:inset 0 1px 0 var(--sep)}
.tile{width:34px;height:34px;border-radius:11px;display:grid;place-items:center}
${v === "a" ? `
.tabbar{background:linear-gradient(180deg,rgba(255,255,255,.78),rgba(255,255,255,.5));-webkit-backdrop-filter:blur(28px) saturate(200%);backdrop-filter:blur(28px) saturate(200%);box-shadow:inset 0 1px 0 rgba(255,255,255,.95),inset 0 0 0 1px rgba(255,255,255,.5),0 0 0 1px rgba(12,30,46,.07),0 18px 38px -10px rgba(12,30,46,.34),0 2px 6px rgba(12,30,46,.08)}
.tab{color:#56626d}.tab.on{color:#0c1e2e;background:linear-gradient(180deg,#fff,rgba(255,255,255,.62));box-shadow:inset 0 1px 0 #fff,0 0 0 1px rgba(12,30,46,.05),0 8px 16px -6px rgba(12,30,46,.3)}
.badge{box-shadow:0 0 0 2px rgba(255,255,255,.85)}
.home-ind{background:rgba(12,30,46,.82)}
.sheet{--sep:rgba(12,30,46,.08);background:linear-gradient(180deg,rgba(252,251,248,.9),rgba(246,244,240,.84));-webkit-backdrop-filter:blur(40px) saturate(190%);backdrop-filter:blur(40px) saturate(190%);box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 -20px 50px -18px rgba(12,30,46,.4)}
.grab{background:rgba(12,30,46,.22)}
.who{background:#fff;box-shadow:0 1px 2px rgba(12,30,46,.05)}.who i{color:#56626d}.out{background:rgba(12,30,46,.06);color:#0c1e2e}
.sheet h4{color:#56626d}.group{background:#fff;box-shadow:0 1px 2px rgba(12,30,46,.05)}.grow .ic:last-child{color:#98a2ab}
.tile{background:#0c1e2e;color:#E9AF88}
` : `
.tabbar{background:linear-gradient(180deg,rgba(24,46,66,.9),rgba(12,30,46,.92));-webkit-backdrop-filter:blur(26px) saturate(170%);backdrop-filter:blur(26px) saturate(170%);box-shadow:inset 0 1px 0 rgba(255,255,255,.24),inset 0 0 0 1px rgba(255,255,255,.08),0 20px 40px -10px rgba(12,30,46,.6),0 2px 6px rgba(12,30,46,.2)}
.tab{color:rgba(244,242,238,.6)}.tab.on{color:#E9AF88;background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.08));box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 8px 18px -8px rgba(0,0,0,.5)}
.tab.on span{color:#F4F2EE}
.badge{box-shadow:0 0 0 2px rgba(12,30,46,.9)}
.home-ind{background:rgba(12,30,46,.82)}
.sheet{--sep:rgba(255,255,255,.09);background:linear-gradient(180deg,rgba(22,44,64,.9),rgba(12,30,46,.94));-webkit-backdrop-filter:blur(40px) saturate(160%);backdrop-filter:blur(40px) saturate(160%);color:#F4F2EE;box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 -20px 50px -18px rgba(0,0,0,.6)}
.grab{background:rgba(255,255,255,.28)}
.sheet-search{background:rgba(255,255,255,.1);color:rgba(244,242,238,.62)}
.who{background:rgba(255,255,255,.08)}.who i{color:rgba(244,242,238,.62)}.out{background:rgba(255,255,255,.12);color:#F4F2EE}
.avatar.big{background:#E9AF88;color:#0c1e2e;box-shadow:none}
.sheet h4{color:rgba(244,242,238,.6)}.group{background:rgba(255,255,255,.08)}.grow .ic:last-child{color:rgba(244,242,238,.4)}
.tile{background:rgba(233,175,136,.16);color:#E9AF88}
`}`;

const NAMES = { a: ["A. Frost", "A light glass capsule floats above the page. A frosted lens slides to the open tab. The sheet is frosted paper."], b: ["B. Ink", "A navy glass capsule that echoes the desktop sidebar. A peach glow marks the open tab. The sheet is navy glass."] };

for (const v of ["a", "b"]) {
  const [name, note] = NAMES[v];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><style>${CSS(v)}</style></head><body>
  <div class="title"><h1>${name}</h1><p>${note}</p></div>
  <div class="board">
    <div><div class="phone">${overview()}</div><div class="cap">Home, content passes under the glass</div></div>
    <div><div class="phone">${leads()}</div><div class="cap">Scrolled list, large title collapses into a glass top bar</div></div>
    <div><div class="phone">${more()}</div><div class="cap">More opens a bottom sheet</div></div>
  </div></body></html>`;
  writeFileSync(join(here, `${v}.html`), html);
}
console.log("built a.html, b.html");
