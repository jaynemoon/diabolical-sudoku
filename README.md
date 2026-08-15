# Diabolical Sudoku

Variant sudoku for when the hard boards have run out.

Stack up to five extra rules on a classic grid, pick a difficulty, and get a
board built to order. Every one is generated, checked for a single solution,
then solved a second time by a technique solver that grades what it genuinely
demands — so the difficulty is measured rather than claimed.

One self-contained `index.html`. No dependencies, no build step: open the file
and play.

> **Status** — a working toy, played and tinkered with locally. Saved boards and
> best times are the next thing in.

---

## Rules

| Rule | Constraint |
| --- | --- |
| Diagonal (X) | Both long diagonals hold 1–9 |
| Anti-knight | Cells a knight's move apart cannot share a digit |
| Anti-king | Cells touching, even diagonally, cannot share a digit |
| Killer cages | Cages sum to their total and hold no repeats |
| Thermometers | Digits increase strictly from bulb to tip |

Any combination stacks, and cell highlighting follows whichever rules are live.
At most two of Diagonal, Anti-knight and Anti-king at once — all three together
leave no grid to find.

---

## Difficulty

**A Touch Diabolical → Diabolical → Insanely Diabolical**

Graded on the techniques a board actually requires, from singles and locked
candidates up through X-wings, colouring and forcing chains. Stats reports the
tally, the hardest step, and a score.

Seeds are reproducible: the same seed and rules rebuild the same board.

---

## Tests

```bash
npm test          # engine + UI          ~10s
npm run test:all  # adds robustness      ~55s
```

---

## Layout

```
index.html               the whole game
tests/extract.mjs        lifts the solver out of index.html
tests/engine.test.mjs    generation, solving, grading
tests/ui.test.mjs        the full page under a DOM shim
tests/robustness.test.mjs  rule-combination sweep, determinism, fuzz
tests/calibrate.mjs      difficulty sampling
```
