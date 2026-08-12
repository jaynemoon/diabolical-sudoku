import { loadEngine } from "./extract.mjs";
const E = await loadEngine();

let fails = 0;
const ok = (cond, msg) => { if(!cond){ console.log("  FAIL " + msg); fails++; } };

function validGrid(g, cons, cages, thermos){
  const st = E.buildStruct(cons, cages);
  for(const u of st.units){
    const s = new Set(u.map(i => g[i]));
    if(s.size !== 9) return "unit repeat";
  }
  for(let i = 0; i < 81; i++) for(const p of st.peers[i]) if(g[i] === g[p]) return "peer clash " + i;
  if(cages) for(const cg of cages){
    let s = 0; const seen = new Set();
    for(const i of cg.cells){ s += g[i]; if(seen.has(g[i])) return "cage repeat"; seen.add(g[i]); }
    if(s !== cg.sum) return "cage sum " + s + " vs " + cg.sum;
  }
  if(thermos) for(const t of thermos) for(let k = 1; k < t.length; k++) if(g[t[k]] <= g[t[k-1]]) return "thermo order";
  return null;
}

/* ---- 1. full grids honour every constraint combination ---- */
console.log("\n[1] solution grids satisfy their constraints");
const COMBOS = [
  { name: "classic", c: {} },
  { name: "diagonal", c: { diagonal: true } },
  { name: "anti-knight", c: { antiKnight: true } },
  { name: "anti-king", c: { antiKing: true } },
  { name: "diag+knight", c: { diagonal: true, antiKnight: true } },
  { name: "knight+king", c: { antiKnight: true, antiKing: true } },
];
for(const { name, c } of COMBOS){
  const cons = { diagonal: false, antiKnight: false, antiKing: false, killer: false, thermo: false, ...c };
  const eng = E.makeEngine(cons, null, null);
  const rnd = E.mulberry32(E.hashStr(name));
  const g = E.fullGrid(eng, rnd);
  ok(!!g, name + ": no solution grid found");
  if(g){ const err = validGrid(g, cons, null, null); ok(!err, name + ": " + err); }
  console.log("  " + name.padEnd(14) + (g ? "ok" : "NO GRID"));
}

/* ---- 1b. an over-constrained rule set must starve, not hang ---- */
console.log("\n[1b] over-constrained rules give up instead of locking the page");
{
  const cons = { diagonal: true, antiKnight: true, antiKing: true, killer: false, thermo: false };
  const eng = E.makeEngine(cons, null, null);
  const t0 = Date.now();
  let starved = false, grid = null;
  E.beginBudget(400000);
  try { grid = E.fullGrid(eng, E.mulberry32(7)); }
  catch(err){ if(err === E.BUDGET) starved = true; else throw err; }
  E.endBudget();
  const ms = Date.now() - t0;
  ok(starved && !grid, "all three cell rules hit the budget rather than running on");
  ok(ms < 8000, "and it gave up in " + ms + "ms");
  console.log("  diagonal+knight+king: starved after 400k nodes in " + ms + "ms");

  // any two of the three must still work, and comfortably inside the budget
  for(const [name, c] of [["diag+knight", {diagonal:1,antiKnight:1}],
                          ["diag+king",   {diagonal:1,antiKing:1}],
                          ["knight+king", {antiKnight:1,antiKing:1}]]){
    const e2 = E.makeEngine({ diagonal:false, antiKnight:false, antiKing:false, killer:false, thermo:false, ...c }, null, null);
    const t1 = Date.now();
    let g = null;
    E.beginBudget(400000);
    try { g = E.fullGrid(e2, E.mulberry32(11)); } catch(err){ if(err !== E.BUDGET) throw err; }
    E.endBudget();
    ok(!!g, name + ": still generates within budget");
    console.log("  " + name.padEnd(20) + (g ? "ok" : "STARVED") + "  " + (Date.now() - t1) + "ms");
  }
}

/* ---- 2. overlays are consistent with their solution ---- */
console.log("\n[2] killer cages + thermometers match the solution");
{
  const cons = { diagonal: false, antiKnight: false, antiKing: false, killer: true, thermo: true };
  const rnd = E.mulberry32(99);
  const eng0 = E.makeEngine(cons, null, null);
  const sol = E.fullGrid(eng0, rnd);
  const cages = E.makeCages(sol, rnd);
  const thermos = E.makeThermos(sol, rnd, 6);
  const err = validGrid(sol, cons, cages, thermos);
  ok(!err, "overlay mismatch: " + err);
  const covered = new Set(); cages.forEach(c => c.cells.forEach(i => covered.add(i)));
  ok(covered.size === 81, "cages cover " + covered.size + "/81 cells");
  ok(cages.every(c => c.cells.length <= 5), "cage too large");
  console.log("  " + cages.length + " cages, " + thermos.length + " thermos, all consistent");
}

/* ---- 3. the human solver never contradicts the true solution ---- */
console.log("\n[3] generated boards: unique, gradeable, solver agrees with truth");
const targets = ["steady", "tricky", "hard", "diabolical", "insane"];
const results = {};
// mirrors generate() in the page
async function tryGen(cons, target, seedBase, budgetMs){
  const t0 = Date.now();
  const tb = E.BANDS.findIndex(b => b.key === target);
  let best = null;
  const fromEmpty = cons.killer, overlay = cons.killer || cons.thermo;
  const minF = fromEmpty ? 0 : 17, maxF = fromEmpty ? 48 : 52;
  let floor = (fromEmpty ? E.FLOOR_OVERLAY : E.FLOOR_PLAIN)[tb];
  let maxCage = [3, 3, 4, 5, 5][tb];
  let nThermo = [9, 8, 6, 5, 4][tb];
  for(let a = 0; a < 60; a++){
    if(a && Date.now() - t0 > budgetMs) break;
    const rnd = E.mulberry32((E.hashStr(seedBase) + a * 0x9E3779B1) >>> 0);
    const step = a < 8 ? 3 : a < 20 ? 2 : 1;
    const plain = E.makeEngine(cons, null, null);
    const sol = E.fullGrid(plain, rnd);
    if(!sol) continue;
    const cages = cons.killer ? E.makeCages(sol, rnd, maxCage) : null;
    const thermos = cons.thermo ? E.makeThermos(sol, rnd, nThermo) : null;
    const eng = E.makeEngine(cons, cages, thermos);
    const givens = fromEmpty ? E.digFromEmpty(sol, eng, rnd, floor) : E.dig(sol, eng, rnd, floor);
    const g = E.grade(givens, eng);
    if(!g.solved){ floor = Math.min(maxF, floor + step); continue; }
    const res = { givens, sol, cages, thermos, eng, g, ms: Date.now() - t0, attempts: a + 1 };
    if(g.band === tb) return res;
    if(!best || Math.abs(g.band - tb) < Math.abs(best.g.band - tb)) best = res;
    const tooEasy = g.band < tb;
    const nextFloor = Math.min(maxF, Math.max(minF, floor + (tooEasy ? -step : step)));
    if(nextFloor === floor && overlay){
      if(tooEasy){ nThermo = Math.max(3, nThermo - 1); maxCage = Math.min(5, maxCage + 1); }
      else       { nThermo = Math.min(10, nThermo + 1); maxCage = Math.max(2, maxCage - 1); }
    }
    floor = nextFloor;
  }
  return best;
}

for(const t of targets){
  const cons = { diagonal: false, antiKnight: false, antiKing: false, killer: false, thermo: false };
  const r = await tryGen(cons, t, "TEST" + t, 8000);
  if(!r){ console.log("  " + t.padEnd(12) + "none found"); continue; }
  const n = E.countSolutions(r.givens, r.eng, 2);
  ok(n === 1, t + ": solution count is " + n);
  ok(r.g.solved, t + ": not solvable by logic");
  let agree = true;
  for(let i = 0; i < 81; i++) if(E.digits(r.g.cand[i])[0] !== r.sol[i]) agree = false;
  ok(agree, t + ": human solver disagrees with the real solution");
  const clues = r.givens.reduce((a, v) => a + (v ? 1 : 0), 0);
  const peakName = Object.entries(E.TECH).find(([, v]) => v.cost === r.g.peak);
  console.log("  " + t.padEnd(12) + "band=" + E.BANDS[r.g.band].key.padEnd(11) +
    "clues=" + String(clues).padStart(2) + "  effort=" + String(r.g.effort).padStart(4) +
    "  peak=" + (peakName ? peakName[1].label : "?") + "  " + r.ms + "ms");
  results[t] = r;
}

/* ---- 4. variant boards ---- */
console.log("\n[4] variant boards generate, stay unique and stay solvable");
const VAR = [
  ["diagonal", { diagonal: true }],
  ["anti-knight", { antiKnight: true }],
  ["killer", { killer: true }],
  ["thermo", { thermo: true }],
  ["killer+diagonal", { killer: true, diagonal: true }],
  ["knight+thermo", { antiKnight: true, thermo: true }],
];
for(const [name, c] of VAR){
  const cons = { diagonal: false, antiKnight: false, antiKing: false, killer: false, thermo: false, ...c };
  const r = await tryGen(cons, "hard", "V" + name, 9000);
  if(!r){ console.log("  " + name.padEnd(18) + "NONE"); fails++; continue; }
  const n = E.countSolutions(r.givens, r.eng, 2);
  ok(n === 1, name + ": solution count " + n);
  let agree = true;
  for(let i = 0; i < 81; i++) if(E.digits(r.g.cand[i])[0] !== r.sol[i]) agree = false;
  ok(agree, name + ": solver disagrees with truth");
  const err = validGrid(r.sol, cons, r.cages, r.thermos);
  ok(!err, name + ": " + err);
  const clues = r.givens.reduce((a, v) => a + (v ? 1 : 0), 0);
  ok(E.BANDS[r.g.band].key === "hard", name + ": asked hard, got " + E.BANDS[r.g.band].key);
  console.log("  " + name.padEnd(18) + "band=" + E.BANDS[r.g.band].key.padEnd(11) +
    "clues=" + String(clues).padStart(2) + "  " + r.ms + "ms");
}

/* ---- 4b. the difficulty dial actually moves, on variants too ---- */
console.log("\n[4b] difficulty dial sweeps across bands");
for(const [name, c] of [["diagonal", { diagonal: true }], ["anti-knight", { antiKnight: true }], ["killer", { killer: true }]]){
  const cons = { diagonal: false, antiKnight: false, antiKing: false, killer: false, thermo: false, ...c };
  const got = [];
  for(const t of targets){
    const r = await tryGen(cons, t, "D" + name + t, 6000);
    got.push(r ? E.BANDS[r.g.band].key : "—");
    ok(r && E.BANDS[r.g.band].key === t, name + " @ " + t + ": got " + (r ? E.BANDS[r.g.band].key : "none"));
  }
  console.log("  " + name.padEnd(14) + got.join(" → "));
}

/* ---- 5. techniques do not make unsound eliminations ---- */
console.log("\n[5] soundness: no technique ever eliminates the true digit");
{
  let checked = 0;
  // cage arithmetic and thermometer bounds are eliminations too, so they get
  // the same scrutiny as the classic techniques
  const SHAPES = [
    { diagonal: false }, { diagonal: true }, { antiKnight: true }, { antiKing: true },
    { killer: true }, { thermo: true }, { killer: true, thermo: true },
    { diagonal: true, killer: true }, { antiKnight: true, thermo: true }
  ];
  for(let trial = 0; trial < SHAPES.length * 2; trial++){
    const cons = { diagonal: false, antiKnight: false, antiKing: false, killer: false, thermo: false,
                   ...SHAPES[trial % SHAPES.length] };
    const rnd = E.mulberry32(4000 + trial);
    const plain = E.makeEngine(cons, null, null);
    const sol = E.fullGrid(plain, rnd);
    if(!sol) continue;
    const cages = cons.killer ? E.makeCages(sol, rnd, 5) : null;
    const thermos = cons.thermo ? E.makeThermos(sol, rnd, 6) : null;
    const eng = E.makeEngine(cons, cages, thermos);
    const givens = cons.killer ? E.digFromEmpty(sol, eng, rnd, 8) : E.dig(sol, eng, rnd, 17);
    const init = E.initCand(givens, eng);
    if(!init) { fails++; console.log("  FAIL init contradiction"); continue; }
    const { cand, seen } = init;
    for(let step = 0; step < 400; step++){
      const r = E.oneStep(cand, eng, seen);
      if(!r || r === -1) break;
      for(let i = 0; i < 81; i++){
        if(!(cand[i] & E.bit(sol[i]))){
          console.log("  FAIL " + E.TECH[r.tech].label + " removed the true digit at cell " + i);
          fails++; step = 999; break;
        }
      }
      checked++;
    }
  }
  console.log("  " + checked + " deduction steps verified against ground truth");
}

console.log(fails === 0 ? "\nALL TESTS PASSED\n" : "\n" + fails + " FAILURE(S)\n");
process.exit(fails ? 1 : 0);
