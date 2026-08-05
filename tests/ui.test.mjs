import fs from "fs";
import vm from "vm";
import { HTML_PATH } from "./extract.mjs";

/* ---------------------------------------------------------------
   A DOM shim covering exactly the surface the page uses, so the
   whole script — including every UI path — really executes.
   --------------------------------------------------------------- */
class El {
  constructor(tag){
    this.tagName = (tag || "div").toUpperCase();
    this.childNodes = []; this.attrs = {}; this.style = {};
    this.dataset = {}; this._text = ""; this.parentNode = null;
    this.listeners = {}; this.offsetWidth = 100;
    const self = this;
    this.classList = {
      add: (...c) => c.forEach(x => { if(!self._cls().includes(x)) self.attrs.class = self._cls().concat(x).join(" "); }),
      remove: (...c) => { self.attrs.class = self._cls().filter(x => !c.includes(x)).join(" "); },
      toggle: (c, on) => { const has = self._cls().includes(c); const want = on === undefined ? !has : !!on;
        if(want) self.classList.add(c); else self.classList.remove(c); },
      contains: c => self._cls().includes(c)
    };
  }
  _cls(){ return (this.attrs.class || "").split(/\s+/).filter(Boolean); }
  get className(){ return this.attrs.class || ""; }
  set className(v){ this.attrs.class = v; }
  get children(){ return this.childNodes; }
  get firstChild(){ return this.childNodes[0]; }
  get lastChild(){ return this.childNodes[this.childNodes.length - 1]; }
  appendChild(c){ c.parentNode = this; this.childNodes.push(c); return c; }
  setAttribute(k, v){ this.attrs[k] = String(v); if(k === "class") this.attrs.class = String(v); }
  getAttribute(k){ return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(t, f){ (this.listeners[t] ||= []).push(f); }
  get textContent(){
    if(this.childNodes.length) return this.childNodes.map(c => c.textContent).join("");
    return this._text;
  }
  set textContent(v){ this._text = String(v); this.childNodes = []; }
  set innerHTML(v){ this.childNodes = []; this._text = ""; parseInto(this, String(v)); }
  get innerHTML(){ return "<synthetic>"; }
  querySelector(sel){ return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel){
    const out = [];
    const want = sel.replace(/^\./, "");
    const walk = n => { for(const c of n.childNodes){
      if(sel.startsWith(".") ? c._cls().includes(want) : c.tagName === sel.toUpperCase()) out.push(c);
      walk(c); } };
    walk(this); return out;
  }
  closest(sel){
    const want = sel.replace(/^\./, "");
    let n = this;
    while(n){ if(n._cls && n._cls().includes(want)) return n; n = n.parentNode; }
    return null;
  }
  dispatch(type, ev){ (this.listeners[type] || []).forEach(f => f(ev || {})); }
}
/* minimal HTML subset parser: tags, attributes, text */
function parseInto(root, html){
  const stack = [root];
  const re = /<(\/?)([a-zA-Z0-9]+)((?:\s+[a-zA-Z-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while((m = re.exec(html))){
    const [, close, tag, attrs, selfClose, text] = m;
    if(text){ const t = stack[stack.length - 1]; if(text.trim()) t._text += text; continue; }
    if(close){ if(stack.length > 1) stack.pop(); continue; }
    const e = new El(tag);
    for(const a of attrs.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) e.setAttribute(a[1], a[2]);
    stack[stack.length - 1].appendChild(e);
    if(!selfClose && !["br", "i", "img"].includes(tag.toLowerCase())) stack.push(e);
    else if(!selfClose && tag.toLowerCase() === "i") stack.push(e);
  }
}

const byId = new Map();
const documentEl = new El("html");
const body = new El("body");
const docListeners = {};
const document = {
  documentElement: documentEl, body,
  createElement: t => new El(t),
  createElementNS: (ns, t) => new El(t),
  getElementById: id => byId.get(id) || null,
  addEventListener: (t, f) => { (docListeners[t] ||= []).push(f); },
  querySelector: () => null
};
/* fire a keydown at the document, the way the page's global handler sees it */
function pressKey(key, opts = {}){
  const ev = {
    key,
    code: opts.code || (key === " " ? "Space" : ""),
    shiftKey: !!opts.shiftKey,
    target: { tagName: opts.on || "DIV" },
    preventDefault(){ this.defaultPrevented = true; },
    defaultPrevented: false
  };
  (docListeners.keydown || []).forEach(f => f(ev));
  return ev;
}

/* pre-register every id the page looks up */
const src = fs.readFileSync(HTML_PATH, "utf8");
for(const m of src.matchAll(/id="([^"]+)"/g)){
  const e = new El("div"); e.setAttribute("id", m[1]); byId.set(m[1], e);
}

const script = src.slice(src.indexOf("<script>") + 8, src.lastIndexOf("</script>"));
const sandbox = {
  document, console,
  requestAnimationFrame: f => setTimeout(() => f(Date.now()), 0),
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  performance, matchMedia: () => ({ matches: false }),
  Math, Int8Array, Int16Array, Uint8Array, Uint16Array, Map, Set, Array, Object, JSON, String, Number, Boolean,
  Promise, Error, Infinity, NaN, isNaN, parseInt, parseFloat
};
sandbox.globalThis = sandbox; sandbox.window = sandbox;

let fails = 0;
const ok = (c, m) => { if(!c){ console.log("  FAIL " + m); fails++; } else console.log("  ok   " + m); };

console.log("\n[UI] whole page script executes under a DOM shim");
try{
  vm.runInNewContext(script + "\n;globalThis.__S = S; globalThis.__deal = deal; globalThis.__enter = enter; globalThis.__hint = hint; globalThis.__check = check; globalThis.__paint = paint; globalThis.__undo = undo;", sandbox, { timeout: 120000 });
  console.log("  ok   script parsed and ran with no exception");
}catch(e){
  console.log("  FAIL script threw: " + e.message + "\n" + (e.stack || "").split("\n").slice(0, 4).join("\n"));
  fails++;
  process.exit(1);
}

/* deal() is async — wait for the boot deal to land */
const waitFor = async (fn, ms) => {
  const t0 = Date.now();
  while(Date.now() - t0 < ms){ if(fn()) return true; await new Promise(r => setTimeout(r, 25)); }
  return false;
};
const S = sandbox.__S;
const landed = await waitFor(() => S.puzzle, 60000);
ok(landed, "boot deal produced a puzzle");
if(!landed) process.exit(1);

const P = S.puzzle;
ok(P.solution.length === 81, "solution grid present");
ok(byId.get("mBand").textContent.length > 1, "verdict rendered: " + byId.get("mBand").textContent);
ok(byId.get("mClues").textContent !== "—", "clue count rendered: " + byId.get("mClues").textContent);
ok(byId.get("mPeak").textContent !== "—", "hardest technique rendered: " + byId.get("mPeak").textContent);
ok(byId.get("log").childNodes.length > 0, "technique log has " + byId.get("log").childNodes.length + " nodes");
ok(byId.get("grid").childNodes.length === 81, "81 cells built");
ok(byId.get("pad").childNodes.length === 9, "9 pad buttons built");
ok(byId.get("switches").childNodes.length === 5, "5 constraint switches built");

/* the difficulty dial offers four targets — "Steady" is graded but not offered */
const diffLabels = byId.get("diffs").childNodes.map(b => b.textContent);
ok(diffLabels.length === 4, "4 difficulty buttons built, got " + diffLabels.length);
ok(!diffLabels.some(l => /steady/i.test(l)), "Steady is not offered: " + diffLabels.join(" / "));
ok(diffLabels.join(",") === "Tricky,Hard,Diabolical,Nightmare", "dial reads " + diffLabels.join(" → "));
/* each button must still map to its true band index, not its position */
ok(byId.get("diffs").childNodes.every((b, i) => +b.dataset.band === i + 1), "buttons carry their real band index");

/* Space toggles notes mode, and so does N */
const wasNotes = S.notemode;
const spaceEv = pressKey(" ");
ok(S.notemode === !wasNotes, "Space toggles notes mode on");
ok(spaceEv.defaultPrevented, "Space is prevented from scrolling the page");
pressKey(" ");
ok(S.notemode === wasNotes, "Space toggles notes mode back off");
pressKey("n");
ok(S.notemode === !wasNotes, "N still toggles notes mode");
pressKey("n");
/* some browsers/layouts report the key differently; e.code is the fallback */
const codeOnly = S.notemode;
pressKey("Unidentified", { code: "Space" });
ok(S.notemode === !codeOnly, "Space recognised via e.code when key is unhelpful");
pressKey("Unidentified", { code: "Space" });
/* a focused button keeps its own Space press instead of firing twice */
const beforeBtn = S.notemode;
pressKey(" ", { on: "BUTTON" });
ok(S.notemode === beforeBtn, "Space on a focused button does not double-fire");
ok(byId.get("svgOver").childNodes.length > 0, "board rules drawn: " + byId.get("svgOver").childNodes.length + " shapes");

/* the rendered grid must show exactly the givens */
let shown = 0, wrong = 0;
for(let i = 0; i < 81; i++){
  const t = byId.get("grid").childNodes[i].firstChild.textContent;
  if(t){ shown++; if(+t !== P.givens[i]) wrong++; }
}
ok(wrong === 0, "every rendered digit matches its given (" + shown + " shown)");

/* entering the right digit sticks; entering a wrong one is caught by Check */
const empty = [...Array(81).keys()].find(i => !P.givens[i]);
S.sel = empty;
sandbox.__enter(P.solution[empty]);
ok(S.grid[empty] === P.solution[empty], "correct entry accepted at cell " + empty);
ok(byId.get("grid").childNodes[empty].firstChild.textContent === String(P.solution[empty]), "entry rendered");
sandbox.__undo();
ok(S.grid[empty] === 0, "undo clears the entry");

const bad = P.solution[empty] % 9 + 1;
S.sel = empty; sandbox.__enter(bad);
sandbox.__check();
ok(S.bad.has(empty) === (bad !== P.solution[empty]), "Check flags the wrong digit");
sandbox.__undo();

/* hint names a real technique */
sandbox.__hint();
const st = byId.get("status").textContent;
ok(/r\dc\d/.test(st), "hint names a cell: “" + st + "”");

/* filling the solution wins */
for(let i = 0; i < 81; i++){ if(!P.givens[i]){ S.sel = i; sandbox.__enter(P.solution[i]); } }
ok(S.won === true, "completing the grid triggers the win state");
ok(byId.get("status")._cls ? byId.get("status")._cls().includes("win") : true, "win status styled");

/* now the overlay variants, which have their own rendering path */
console.log("\n[UI] killer + thermo variant renders its overlays");
S.cons.killer = true; S.cons.thermo = true; S.target = 2;
byId.get("seed")._text = "KILLER1";
byId.get("seed").value = "KILLER1";
S.puzzle = null;
sandbox.__deal();
const landed2 = await waitFor(() => S.puzzle && S.puzzle.cons.killer, 90000);
ok(landed2, "killer + thermo deal produced a puzzle");
if(landed2){
  const P2 = S.puzzle;
  ok(P2.cages.length > 10, P2.cages.length + " cages generated");
  ok(P2.thermos.length > 0, P2.thermos.length + " thermometers generated");
  const covered = new Set(); P2.cages.forEach(c => c.cells.forEach(i => covered.add(i)));
  ok(covered.size === 81, "cages cover the whole grid");
  const overShapes = byId.get("svgOver").childNodes;
  const texts = overShapes.filter(n => n.tagName === "TEXT");
  ok(texts.length === P2.cages.length, "a sum label drawn for every cage (" + texts.length + ")");
  ok(overShapes.filter(n => n.tagName === "LINE" && n.getAttribute("stroke-dasharray")).length > 0, "dashed cage borders drawn");
  const under = byId.get("svgUnder").childNodes;
  ok(under.filter(n => n.tagName === "POLYLINE").length === P2.thermos.length, "a thermometer drawn for each path");
  ok(under.filter(n => n.tagName === "CIRCLE").length === P2.thermos.length, "a bulb drawn for each thermometer");
  // every cage label must sit on the cage's top-left cell
  let misplaced = 0;
  for(const cg of P2.cages){
    const head = Math.min(...cg.cells);
    const want = { x: (head % 9) * 100 + 13, y: ((head / 9) | 0) * 100 + 31 };
    if(!texts.some(t => +t.getAttribute("x") === want.x && +t.getAttribute("y") === want.y && +t.textContent === cg.sum)) misplaced++;
  }
  ok(misplaced === 0, "every cage sum sits on its top-left cell");
}

console.log(fails === 0 ? "\nUI SMOKE TEST PASSED\n" : "\n" + fails + " UI FAILURE(S)\n");
process.exit(fails ? 1 : 0);
