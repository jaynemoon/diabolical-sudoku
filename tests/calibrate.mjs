import { loadEngine } from "./extract.mjs";
const E = await loadEngine();

// Sample (peak, effort) across clue floors for each variant, to see what the
// grader actually produces and whether peak alone can separate the bands.
const VAR = {
  classic:     {},
  diagonal:    { diagonal: true },
  antiKnight:  { antiKnight: true },
  killer:      { killer: true },
  thermo:      { thermo: true },
};
const base = { diagonal: false, antiKnight: false, antiKing: false, killer: false, thermo: false };

for(const [name, c] of Object.entries(VAR)){
  const cons = { ...base, ...c };
  const overlay = cons.killer || cons.thermo;
  const floors = overlay ? [40, 30, 22, 16, 10, 6, 2, 0] : [44, 40, 36, 32, 28, 24, 20, 17];
  console.log("\n=== " + name + " ===");
  console.log("floor  cage  n   peak(median)  effort(median)   peaks seen");
  for(const floor of floors){
    for(const maxCage of (cons.killer ? [3, 5] : [5])){
      const rows = [];
      for(let s = 0; s < 14; s++){
        const rnd = E.mulberry32(E.hashStr(name + floor + maxCage + "s" + s));
        const plain = E.makeEngine(cons, null, null);
        const sol = E.fullGrid(plain, rnd);
        if(!sol) continue;
        const cages = cons.killer ? E.makeCages(sol, rnd, maxCage) : null;
        const thermos = cons.thermo ? E.makeThermos(sol, rnd, 6) : null;
        const eng = E.makeEngine(cons, cages, thermos);
        const g0 = overlay ? E.digFromEmpty(sol, eng, rnd, floor) : E.dig(sol, eng, rnd, floor);
        const g = E.grade(g0, eng);
        if(!g.solved){ rows.push({ peak: 999, effort: 999 }); continue; }
        rows.push({ peak: g.peak, effort: g.effort });
      }
      if(!rows.length) continue;
      const med = k => { const a = rows.map(r => r[k]).sort((x, y) => x - y); return a[a.length >> 1]; };
      const peaks = [...new Set(rows.map(r => r.peak))].sort((a, b) => a - b).join(",");
      console.log(String(floor).padStart(5) + String(maxCage).padStart(6) + String(rows.length).padStart(4) +
        String(med("peak")).padStart(13) + String(med("effort")).padStart(15) + "   " + peaks);
    }
  }
}
