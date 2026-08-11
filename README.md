# Diabolical Sudoku

Variant sudoku for people who have run out of hard boards.

Five rule sets that stack, boards generated on demand, and a solver that grades
every board by the techniques it actually demands — so *Nightmare* is a
measurement rather than a label.

**Zero dependencies, no build step.** The whole game is one 1,700-line
`index.html`. Open it and play.

---

## Rules

| Rule | Constraint |
| --- | --- |
| Diagonal (X) | Both long diagonals hold 1–9 |
| Anti-knight | Cells a knight's move apart cannot share a digit |
| Anti-king | Cells touching, even diagonally, cannot share a digit |
| Killer cages | Cages sum to their total and hold no repeats |
| Thermometers | Digits increase strictly from bulb to tip |

Any combination stacks, and peer highlighting follows whichever rules are live.
At most two of the three cell rules at once — all three leave the grid
unsatisfiable, which the generator proves the hard way in 100M+ search nodes.

---

## Difficulty is measured, not assumed

Every board is generated, checked for a unique solution, then solved a **second
time** by a human-technique solver: naked and hidden singles, locked candidates,
pairs and triples, X-wing, swordfish, XY- and XYZ-wing, simple colouring, and
depth-one forcing. The console reports the full technique tally and the hardest
step the board genuinely requires.

Grading on that hardest technique alone falls apart on killer boards. Cage
arithmetic resolves exactly the positions where a fish or a wing would otherwise
be needed, so the peak sits flat at *cage* from 40 clues down to none while the
real workload rises tenfold. Total solving effort is the only signal that stays
monotone across every variant — so bands are a composite dominated by effort,
with the hardest technique setting a floor beneath it.

The generator **steers** rather than guesses: it grades each attempt and moves
the clue floor against the error, falling back to cage size and thermometer
count once uniqueness stops it removing clues. Every attempt carries a node and
wall-clock budget, so no rule set can block the page.

Seeds are reproducible — the same seed and rules always rebuild the same board.

---

## Tests

```bash
npm test          # engine + UI          ~10s
npm run test:all  # adds robustness      ~55s
```

- **Soundness** — 1,217 real deduction steps checked against ground truth. An
  unsound technique wouldn't throw; it would quietly emit unsolvable boards and
  the player would blame themselves.
- **Combination sweep** — all 32 rule combinations, each asserted to terminate
  inside a time ceiling and return either a validated board or a *deliberate*
  refusal. Returning nothing without having starved is a failure: that is the
  difference between a message and a frozen tab.
- **Input fuzz** — 4,000 random gestures holding every state invariant, plus an
  undo round-trip back to the dealt board.

No browser, no framework, no dependency. The suites read the solver straight out
of `index.html`, so the shipped game and the tested code cannot drift apart.

---

## Layout

```
index.html               the entire game
tests/extract.mjs        lifts the solver out of index.html
tests/engine.test.mjs    generation, solving, grading
tests/ui.test.mjs        the full page under a DOM shim
tests/robustness.test.mjs  rule-combination sweep, determinism, fuzz
tests/calibrate.mjs      difficulty sampling
```
