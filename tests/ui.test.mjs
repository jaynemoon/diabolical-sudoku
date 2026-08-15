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
    const isClass = sel.startsWith(".");
    const want = isClass ? sel.slice(1) : sel.toUpperCase();
    let n = this;
    while(n){
      if(isClass ? (n._cls && n._cls().includes(want)) : n.tagName === want) return n;
      n = n.parentNode;
    }
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
  vm.runInNewContext(script + "\n;globalThis.__S = S; globalThis.__deal = deal; globalThis.__enter = enter; globalThis.__hint = hint; globalThis.__paint = paint; globalThis.__undo = undo; globalThis.__BANDS = BANDS; globalThis.__toggleNotes = toggleNotes;", sandbox, { timeout: 120000 });
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
ok(byId.get("mSteps").textContent !== "—", "deduction step count rendered: " + byId.get("mSteps").textContent);
ok(byId.get("mBand").getAttribute("data-band"), "verdict carries its band for styling: " + byId.get("mBand").getAttribute("data-band"));
ok(!!byId.get("clockT"), "the header clock has its own text node");
ok(!!byId.get("menuBtn") && !!byId.get("menuPop"), "the settings menu exists");
/* removed chrome: the ruleset name beside the Generator heading, and the
   commentary line after a successful deal */
ok(!src.includes('id="cName"'), "no ruleset label beside the Generator heading");
ok(!/Clock starts/.test(src), "no “clock starts” line after a deal");
ok(byId.get("log").childNodes.length > 0, "technique log has " + byId.get("log").childNodes.length + " nodes");
ok(byId.get("grid").childNodes.length === 81, "81 cells built");
ok(byId.get("pad").childNodes.length === 9, "9 pad buttons built");
ok(byId.get("switches").childNodes.length === 5, "5 constraint chips built");

/* The dial offers only the top three. Steady and Tricky still exist in the
   scale so an easy board is reported honestly, but neither is a target. */
const diffLabels = byId.get("diffs").childNodes.map(b => b.textContent);
ok(diffLabels.length === 3, "3 difficulty buttons built, got " + diffLabels.length);
ok(!diffLabels.some(l => /steady|tricky/i.test(l)), "the easy bands are not offered: " + diffLabels.join(" / "));
ok(diffLabels.join(",") === "A Touch Diabolical,Diabolical,Insanely Diabolical", "dial reads " + diffLabels.join(" → "));
/* each button must map to its true band index, not its position: dropping a
   band from the front would otherwise shift every difficulty by a rung */
ok(byId.get("diffs").childNodes.every((b, i) => +b.dataset.band === i + 2), "buttons carry their real band index");
/* renaming the top band must not have moved any threshold */
{
  const B = sandbox.__BANDS;
  ok(B.length === 5, "the scale still has 5 bands, got " + B.length);
  ok(B.map(b => b.max).join(",") === "55,95,165,300,Infinity",
     "band thresholds unchanged: " + B.map(b => b.max).join(","));
  ok(B[4].key === "insane" && B[4].label === "Insanely Diabolical",
     "the top band is Insanely Diabolical");
  ok(B[2].label === "A Touch Diabolical", "the entry band is A Touch Diabolical");
  ok(B[4].max === Infinity, "and it keeps the old top-band ceiling");
  ok(B.filter(b => b.selectable === false).map(b => b.key).join(",") === "steady,tricky",
     "exactly Steady and Tricky are withheld");
}

/* the third cell rule is refused, so the generator is never asked to grind */
{
  const sw = byId.get("switches").childNodes;
  const tick = (i) => sw[i].dispatch("click", { target: sw[i] });
  S.cons.diagonal = S.cons.antiKnight = S.cons.antiKing = false;
  tick(0); tick(1);
  ok(S.cons.diagonal && S.cons.antiKnight, "two cell rules combine freely");
  ok(sw[0].className.includes("on") && sw[1].className.includes("on"), "and both chips light");
  tick(2);
  ok(S.cons.antiKing === false, "the third cell rule is refused");
  ok(!sw[2].className.includes("on"), "and its chip does not light");
  ok(/at most two/.test(byId.get("status").textContent), "with an explanation: “" + byId.get("status").textContent + "”");
  tick(3);
  ok(S.cons.killer === true, "killer cages are unaffected by the cap");
  tick(0); tick(1); tick(3);
  ok(!S.cons.diagonal && !S.cons.antiKnight && !S.cons.killer, "rules clear again");
  ok(!sw[0].className.includes("on"), "and the chips unlight");
}

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

/* entering the right digit sticks; a wrong one is caught by Hint, which
   refuses to reason past it and marks it red */
const empty = [...Array(81).keys()].find(i => !P.givens[i]);
S.sel = empty;
sandbox.__enter(P.solution[empty]);
ok(S.grid[empty] === P.solution[empty], "correct entry accepted at cell " + empty);
ok(byId.get("grid").childNodes[empty].firstChild.textContent === String(P.solution[empty]), "entry rendered");
sandbox.__undo();
ok(S.grid[empty] === 0, "undo clears the entry");

const bad = P.solution[empty] % 9 + 1;
S.sel = empty; sandbox.__enter(bad);
sandbox.__hint();
ok(S.bad.has(empty), "Hint flags a wrong digit rather than reasoning past it");
ok(/red/.test(byId.get("status").textContent), "and says so: “" + byId.get("status").textContent + "”");
sandbox.__undo();

/* Mouse model: right button = notes, left click on the board = back to pen.
   The invariant that matters is that notes mode can never get stuck on. */
{
  const rightClick = (host, target) => {
    const ev = { target, button: 2, preventDefault(){ this.defaultPrevented = true; }, defaultPrevented: false };
    byId.get(host).dispatch("contextmenu", ev);
    return ev;
  };
  const leftClick = (cellIdx) => {
    const ev = { target: byId.get("grid").childNodes[cellIdx], button: 0 };
    byId.get("grid").dispatch("pointerdown", ev);
    return ev;
  };

  const cell = [...Array(81).keys()].find(i => !P.givens[i] && !S.grid[i]);
  const other = [...Array(81).keys()].find(i => !P.givens[i] && !S.grid[i] && i !== cell);
  const padBtn = byId.get("pad").childNodes[4];        // the "5" key

  S.notemode = false;
  leftClick(cell);
  ok(S.sel === cell, "left-clicking a cell selects it");

  const ev = rightClick("pad", padBtn);
  ok(ev.defaultPrevented, "the OS context menu is suppressed on the pad");
  ok(S.notemode === true, "right-clicking a pad digit switches notes on");
  ok(S.notes[cell] === (1 << 4), "…and pencils that digit into the selected cell");
  ok(S.grid[cell] === 0, "a pencil mark is not written as a digit");

  rightClick("pad", padBtn);
  ok(S.notes[cell] === 0, "right-clicking the same digit again removes the mark");
  ok(S.notemode === true, "notes mode stays on while pencilling");

  /* right-clicking a cell re-targets without dropping out of notes */
  const cev = rightClick("grid", byId.get("grid").childNodes[other]);
  ok(cev.defaultPrevented, "the OS context menu is suppressed on the board");
  ok(S.sel === other, "right-clicking a cell moves the selection");
  ok(S.notemode === true, "right-clicking a cell keeps notes mode on");

  /* the escape hatch: any plain left click returns to writing digits */
  leftClick(cell);
  ok(S.sel === cell, "left-clicking selects while in notes mode");
  ok(S.notemode === false, "left-clicking a cell drops back to pen mode");
  ok(byId.get("btnNotes").className.includes("on") === false, "the Notes button unlights with it");

  /* and a digit typed after that click is a real digit, not a mark */
  sandbox.__enter(P.solution[cell]);
  ok(S.grid[cell] === P.solution[cell], "typing after a left click writes a digit, not a pencil mark");
  sandbox.__undo();

  const givenCell = [...Array(81).keys()].find(i => P.givens[i]);
  S.sel = givenCell;
  rightClick("pad", padBtn);
  ok(S.notes[givenCell] === 0, "a given cell refuses pencil marks");

  S.notemode = false;
  sandbox.__paint();
}

/* hint names a real technique */
sandbox.__hint();
const st = byId.get("status").textContent;
ok(/r\dc\d/.test(st), "hint names a cell: “" + st + "”");

/* Toolbar state: never two things selected at once, and a result clears when
   you touch the board — the same contract notes mode already follows. */
console.log("\n[UI] the tool row shows one current thing at a time");
{
  const lit = id => byId.get(id).className.includes("on");
  const anyCell = [...Array(81).keys()].find(i => !P.givens[i]);
  const clickCell = i => byId.get("grid").dispatch("pointerdown",
    { target: byId.get("grid").childNodes[i], button: 0 });

  // reset
  if(S.notemode) sandbox.__toggleNotes();
  clickCell(anyCell);

  // the reported bug: notes on, then Hint, left both lit
  sandbox.__toggleNotes();
  ok(lit("btnNotes"), "Notes lights when switched on");
  sandbox.__hint();
  ok(!lit("btnNotes"), "asking for a hint turns Notes off");
  ok(lit("btnHint"), "and Hint lights instead");

  // touching the board returns the row to default
  clickCell(anyCell);
  ok(!lit("btnHint"), "clicking a cell clears the Hint highlight");
  ok(!lit("btnNotes"), "and nothing else is left lit");

  // turning Notes on clears a lit result
  sandbox.__hint();
  sandbox.__toggleNotes();
  ok(lit("btnNotes"), "Notes lights");
  ok(!lit("btnHint"), "and clears the lit result");
  sandbox.__toggleNotes();
  clickCell(anyCell);

  /* byId is built from the ids present in the markup, so this asserts the two
     removed controls are really gone rather than merely unwired */
  ok(!byId.has("btnAuto"), "Auto-pencil is gone from the markup");
  ok(!byId.has("btnCheck"), "Check is gone from the markup");
  ok(!!byId.get("btnNotes") && !!byId.get("btnUndo") && !!byId.get("btnHint"),
     "Notes, Undo and Hint remain");
}

/* Input fuzz: thousands of random gestures must never throw and never corrupt
   state. A game is driven by whatever the player does in whatever order, so
   the invariants matter more than any single scripted sequence. */
console.log("\n[UI] input fuzz — 4000 random gestures hold every invariant");
{
  let rng = 20260804;
  const rnd = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = a => a[(rnd() * a.length) | 0];

  const grid = byId.get("grid"), pad = byId.get("pad");
  const givensCopy = Int8Array.from(P.givens);
  let threw = null, brokeGiven = null, badVal = null, badNote = null, badSel = null;

  const actions = [
    () => pressKey(String(1 + ((rnd() * 9) | 0))),
    () => pressKey(String(1 + ((rnd() * 9) | 0)), { shiftKey: true }),
    () => pressKey(pick(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"])),
    () => pressKey(pick(["Backspace","Delete","0"])),
    () => pressKey(" "),
    () => pressKey("n"),
    () => pressKey("u"),
    () => grid.dispatch("pointerdown", { target: grid.childNodes[(rnd()*81)|0], button: 0 }),
    () => grid.dispatch("contextmenu", { target: grid.childNodes[(rnd()*81)|0], button: 2, preventDefault(){} }),
    () => pad.dispatch("contextmenu",  { target: pad.childNodes[(rnd()*9)|0],  button: 2, preventDefault(){} }),
    () => byId.get("btnNotes").dispatch("click", {}),
    () => byId.get("btnUndo").dispatch("click", {})
  ];

  for(let n = 0; n < 4000 && !threw; n++){
    try { pick(actions)(); }
    catch(err){ threw = "gesture " + n + ": " + (err && err.message ? err.message : String(err)); break; }

    for(let i = 0; i < 81; i++){
      if(givensCopy[i] && S.grid[i] !== givensCopy[i]) brokeGiven ??= "cell " + i + " at gesture " + n;
      const v = S.grid[i];
      if(!(v >= 0 && v <= 9) || !Number.isInteger(v)) badVal ??= "cell " + i + " = " + v;
      if(!(S.notes[i] >= 0 && S.notes[i] <= 511)) badNote ??= "cell " + i + " = " + S.notes[i];
    }
    if(!(S.sel >= 0 && S.sel < 81)) badSel ??= "sel = " + S.sel + " at gesture " + n;
    if(brokeGiven || badVal || badNote || badSel) break;
  }

  ok(!threw, "no gesture threw: " + (threw || "none"));
  ok(!brokeGiven, "a given was never overwritten: " + (brokeGiven || "held"));
  ok(!badVal, "every cell stayed a digit 0–9: " + (badVal || "held"));
  ok(!badNote, "every pencil mask stayed a valid 9-bit set: " + (badNote || "held"));
  ok(!badSel, "the cursor stayed on the board: " + (badSel || "held"));
  ok(S.hist.length <= 500, "undo history stayed bounded at " + S.hist.length);

  /* undoing everything must return the board to its dealt state */
  let guard = 0;
  while(S.hist.length && guard++ < 2000) sandbox.__undo();
  let restored = true;
  for(let i = 0; i < 81; i++) if(S.grid[i] !== givensCopy[i]) restored = false;
  ok(restored, "undoing every move restores the dealt board exactly");

  /* leave a clean slate for the win test */
  S.notemode = false;
  byId.get("btnNotes").classList.remove("on");
  S.grid = Int8Array.from(P.givens);
  S.notes = new Uint16Array(81);
  S.hist = []; S.bad.clear(); S.won = false;
  sandbox.__paint();
}

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

/* A hidden tab must still be able to deal. requestAnimationFrame is throttled
   to a near stop when the page is not visible, so the generator falls back to a
   timer; before that fix the loop stalled until you came back to the tab. */
console.log("\n[UI] a board still deals while the page is hidden");
{
  document.hidden = true;
  S.puzzle = null;
  byId.get("seed").value = "HIDDEN1";
  const t0 = Date.now();
  sandbox.__deal();
  const landedHidden = await waitFor(() => S.puzzle, 45000);
  document.hidden = false;
  ok(landedHidden, "dealt with document.hidden = true in " + (Date.now() - t0) + "ms");
  if(landedHidden){
    ok(S.puzzle.solution.length === 81, "and the board it produced is a real one");
    ok(byId.get("mBand").textContent !== "—", "with its verdict reported: " + byId.get("mBand").textContent);
  }
}

console.log(fails === 0 ? "\nUI SMOKE TEST PASSED\n" : "\n" + fails + " UI FAILURE(S)\n");
process.exit(fails ? 1 : 0);
