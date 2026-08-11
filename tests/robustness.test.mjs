/* Robustness suite.
 *
 * The freeze that shipped was not caught because the engine suite reimplemented
 * the generator's control loop instead of calling it, and because no test ever
 * swept the constraint combinations. This suite does both: it drives the real
 * generate() across every reachable rule set and asserts the two properties
 * that matter for a game — it always terminates, and whatever it hands back is
 * actually playable.
 *
 * Slower than the unit suites. Run with `npm run test:all`.
 */
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);

import { loadEngine } from "./extract.mjs";
const E = await loadEngine();

let fails = 0;
const ok = (cond, msg) => { if(!cond){ console.log("  FAIL " + msg); fails++; } return cond; };

const BASE = { diagonal:false, antiKnight:false, antiKing:false, killer:false, thermo:false };
const KEYS = ["diagonal", "antiKnight", "antiKing", "killer", "thermo"];
const SHORT = { diagonal:"diag", antiKnight:"knight", antiKing:"king", killer:"killer", thermo:"thermo" };
const nameOf = c => KEYS.filter(k => c[k]).map(k => SHORT[k]).join("+") || "classic";

/* Everything a board must satisfy to be playable. */
function validate(P, label){
  const g = P.solution, cons = P.cons;
  const st = E.buildStruct(cons, P.cages.length ? P.cages : null);
  let bad = null;

  for(const u of st.units) if(new Set(u.map(i => g[i])).size !== 9) bad = "unit repeat";
  for(let i = 0; i < 81 && !bad; i++)
    for(const p of st.peers[i]) if(g[i] === g[p]) bad = "peer clash at " + i;
  for(const cg of P.cages){
    if(bad) break;
    let s = 0; const seen = new Set();
    for(const i of cg.cells){ s += g[i]; if(seen.has(g[i])) bad = "cage repeat"; seen.add(g[i]); }
    if(s !== cg.sum) bad = "cage sum " + s + " vs " + cg.sum;
    if(cg.cells.length > 5) bad = "cage larger than 5";
  }
  for(const t of P.thermos){
    if(bad) break;
    for(let k = 1; k < t.length; k++) if(g[t[k]] <= g[t[k-1]]) bad = "thermo not increasing";
  }
  ok(!bad, label + ": solution violates its own rules — " + bad);

  // givens must agree with the solution, and digits must be in range
  let mismatched = 0, outOfRange = 0;
  for(let i = 0; i < 81; i++){
    if(P.givens[i] && P.givens[i] !== g[i]) mismatched++;
    if(g[i] < 1 || g[i] > 9) outOfRange++;
  }
  ok(mismatched === 0, label + ": " + mismatched + " givens contradict the solution");
  ok(outOfRange === 0, label + ": solution has out-of-range digits");

  // exactly one solution, and the logic solver must reach the same one
  const n = E.countSolutions(P.givens, P.E, 2);
  ok(n === 1, label + ": has " + n + " solutions, must be exactly 1");
  ok(P.grade.solved, label + ": not solvable by logic alone");
  if(P.grade.cand){
    let disagree = 0;
    for(let i = 0; i < 81; i++) if(E.digits(P.grade.cand[i])[0] !== g[i]) disagree++;
    ok(disagree === 0, label + ": solver disagrees with truth in " + disagree + " cells");
  }
  return !bad;
}

/* ---- 1. every rule combination terminates and yields something playable ---- */
console.log("\n[R1] all 32 rule combinations: bounded time, playable or a clean refusal");
console.log("  combination            ms     outcome");
const CEILING_MS = 20000;
const results = [];
for(let mask = 0; mask < 32; mask++){
  const cons = { ...BASE };
  KEYS.forEach((k, b) => { if(mask & (1 << b)) cons[k] = true; });
  const label = nameOf(cons);
  const cellRules = ["diagonal","antiKnight","antiKing"].filter(k => cons[k]).length;

  const t0 = Date.now();
  let out = null, threw = null;
  try{
    out = await E.generate(cons, 2 /* Hard */, "SWEEP" + mask, () => {});
  }catch(err){ threw = err && err.message ? err.message : String(err); }
  const ms = Date.now() - t0;

  ok(!threw, label + ": generate threw — " + threw);
  ok(ms < CEILING_MS, label + ": took " + ms + "ms, over the " + CEILING_MS + "ms ceiling");

  let outcome;
  if(out && out.puzzle){
    outcome = "playable (" + E.BANDS[out.puzzle.grade.band].key + ")";
    validate(out.puzzle, label);
  }else{
    // a refusal is fine, but it must be a deliberate one
    outcome = "refused (starved " + (out ? out.starved : "?") + "/" + (out ? out.attempts : "?") + ")";
    ok(out && out.starved > 0,
       label + ": returned no board without starving — that is a silent failure, not a refusal");
  }
  results.push({ label, ms, playable: !!(out && out.puzzle), cellRules });
  console.log("  " + label.padEnd(22) + String(ms).padStart(6) + "  " + outcome);
}

const impossible = results.filter(r => !r.playable);
console.log("\n  " + (results.length - impossible.length) + "/32 combinations produce a board");
if(impossible.length) console.log("  refused: " + impossible.map(r => r.label).join(", "));
// the only combinations allowed to fail are those stacking all three cell rules
ok(impossible.every(r => r.cellRules === 3),
   "a combination outside the known-bad trio failed: " +
   impossible.filter(r => r.cellRules !== 3).map(r => r.label).join(", "));
ok(results.filter(r => r.cellRules === 3).every(r => !r.playable),
   "the three-cell-rule combinations are consistently refused");

/* ---- 2. seeds are reproducible, which the UI promises ---- */
console.log("\n[R2] the same seed rebuilds the same board");
for(const [label, c] of [["classic", {}], ["diagonal", {diagonal:1}], ["killer", {killer:1}], ["thermo", {thermo:1}]]){
  const cons = { ...BASE, ...c };
  const a = await E.generate(cons, 2, "REPEAT" + label, () => {});
  const b = await E.generate(cons, 2, "REPEAT" + label, () => {});
  if(!a.puzzle || !b.puzzle){ ok(false, label + ": no board to compare"); continue; }
  const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  const sameCages = JSON.stringify(a.puzzle.cages) === JSON.stringify(b.puzzle.cages);
  const sameTherm = JSON.stringify(a.puzzle.thermos) === JSON.stringify(b.puzzle.thermos);
  ok(same(Array.from(a.puzzle.givens), Array.from(b.puzzle.givens)), label + ": givens differ across runs");
  ok(same(Array.from(a.puzzle.solution), Array.from(b.puzzle.solution)), label + ": solutions differ across runs");
  ok(sameCages && sameTherm, label + ": overlays differ across runs");
  console.log("  " + label.padEnd(12) + "reproducible");
}

/* ---- 3. a different seed gives a different board ---- */
console.log("\n[R3] different seeds give different boards");
{
  const seen = new Set();
  for(let i = 0; i < 6; i++){
    const r = await E.generate({ ...BASE }, 2, "VARY" + i, () => {});
    if(r.puzzle) seen.add(Array.from(r.puzzle.solution).join(""));
  }
  ok(seen.size === 6, "6 seeds produced " + seen.size + " distinct boards");
  console.log("  6 seeds → " + seen.size + " distinct grids");
}

/* ---- 4. every difficulty on every viable combination stays bounded ---- */
console.log("\n[R4] each difficulty band stays inside the time ceiling");
const VIABLE = [
  ["classic", {}], ["diagonal", {diagonal:1}], ["knight", {antiKnight:1}],
  ["killer", {killer:1}], ["thermo", {thermo:1}], ["killer+thermo", {killer:1,thermo:1}],
  ["diag+knight", {diagonal:1,antiKnight:1}]
];
for(const [label, c] of VIABLE){
  const row = [];
  for(let band = 0; band < 5; band++){
    const t0 = Date.now();
    const r = await E.generate({ ...BASE, ...c }, band, "BAND" + label + band, () => {});
    const ms = Date.now() - t0;
    ok(ms < CEILING_MS, label + " @ " + E.BANDS[band].key + ": " + ms + "ms exceeds ceiling");
    if(r.puzzle) ok(validate(r.puzzle, label + "@" + E.BANDS[band].key) !== false, label + " invalid");
    row.push(E.BANDS[band].key.slice(0,4) + ":" + (r.puzzle ? ms : "—") + "ms");
  }
  console.log("  " + label.padEnd(14) + row.join("  "));
}

console.log(fails === 0 ? "\nROBUSTNESS SUITE PASSED\n" : "\n" + fails + " FAILURE(S)\n");
process.exit(fails ? 1 : 0);
