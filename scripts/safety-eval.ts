/** Run the safety evaluation suite from the command line. `npm run safety:eval [-- --model]` */
import { runSafetyEval } from "../src/lib/safety/eval";

const useModel = process.argv.includes("--model");
runSafetyEval({ createdBy: "cli", useModel, persist: false }).then((r) => {
  for (const c of r.results) console.log(`${c.passed ? "PASS" : "FAIL"}  ${c.id.padEnd(28)} expected ${c.expected.padEnd(18)} got ${c.got}`);
  console.log(`\n${r.summary.passed}/${r.summary.total} passed · ${r.summary.missed} missed · ${r.summary.falsePositives} over-flagged`);
  process.exit(r.summary.passed === r.summary.total ? 0 : 1);
});
