/* The game ships as one self-contained index.html, so the tests pull the solver
   out of it rather than keeping a second copy that could drift. Sections 0–5 of
   the page script are pure logic with no DOM access; section 6 is the UI. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const HTML_PATH = path.join(HERE, "..", "index.html");
const ENGINE_PATH = path.join(HERE, "_engine.generated.mjs");

const EXPORTS = [
  "ALL", "bit", "pc", "digits", "mulberry32", "hashStr", "shuffle",
  "buildStruct", "makeEngine", "reduceAll", "search", "candFromGrid",
  "countSolutions", "grade", "initCand", "oneStep", "TECH", "BANDS",
  "bandOf", "bandFor", "scoreOf", "fullGrid", "makeCages", "makeThermos",
  "dig", "digFromEmpty", "pruneThermo", "pruneCages", "rowOf", "colOf",
  "CELLS", "FLOOR_PLAIN", "FLOOR_OVERLAY"
];

export function readPageScript(){
  const src = fs.readFileSync(HTML_PATH, "utf8");
  return src.slice(src.indexOf("<script>") + 8, src.lastIndexOf("</script>"));
}

export async function loadEngine(){
  const script = readPageScript();
  const upToUI = script.slice(0, script.indexOf("   6. UI"));
  const code = upToUI.slice(0, upToUI.lastIndexOf("/* ====")) +
    "\nexport {" + EXPORTS.join(",") + "};\n";
  fs.writeFileSync(ENGINE_PATH, code);
  return import(ENGINE_PATH + "?v=" + Date.now());
}
