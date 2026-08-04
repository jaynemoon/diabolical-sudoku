# Diabolical Sudoku 

Advanced(hard) sudoku variant I created, as I needed a challenge from the 'Hard' Sudoku Switch games. Fulfilling the need for harder, more diabolical Sudoku boards. 

## Game Mechanics

Any combination can be switched on at once:

| Rule            | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| Diagonal (X)    | Both long diagonals hold 1–9                                 |
| Anti-knight     | Cells a knight's move apart cannot share a digit             |
| Anti-king       | Cells touching, even diagonally, cannot share a digit        |
| Killer cages    | Dashed cages sum to their total and hold no repeats          |
| Thermometers    | Digits increase strictly from the bulb to the tip            |

Peer highlighting follows whichever rules are active, so with anti-knight on the
knight-move cells light up alongside the row, column and box.

## Difficulty

Boards are generated, checked for a unique solution, then solved a second time
by a human-technique solver: naked and hidden singles, locked candidates, naked
and hidden pairs and triples, X-wing, swordfish, XY-wing, XYZ-wing, simple
colouring, and depth-one forcing. The console reports the technique tally, the
hardest step required, and a score.

Two things worth knowing if you tune this:

**Bands are a composite dominated by total solving effort, with the hardest
technique setting a floor under the result.** Grading on the hardest technique
alone falls apart on killer boards — cage arithmetic resolves the positions
where a fish or a wing would otherwise be needed, so the peak sits flat at
"cage" from 40 clues down to none while the real workload rises tenfold. Total
effort is the only signal that stays monotone across every variant. The floor
stops a short board that genuinely needs a chain from being labelled gentle.

**The generator steers difficulty rather than guessing at it.** Each attempt is
graded, and the clue floor moves against the error: too easy digs deeper next
time, too hard leaves more clues standing. Uniqueness puts a hard limit on how
few clues a board can carry, so when the clue floor saturates the generator
adjusts the overlay instead — cage size and thermometer count.

Seeds are shareable. The same seed and the same constraints always rebuild the
same board.

## Controls

| Key        | Action                        |
| ---------- | ----------------------------- |
| `1`–`9`    | Write a digit                 |
| `⇧`+`1`–`9`| Toggle a pencil mark          |
| `N`        | Notes mode on / off           |
| Arrow keys | Move the cursor               |
| `⌫`        | Clear the cell                |
| `U`        | Undo                          |
| `H`        | Hint — names the technique    |
| `C`        | Check entries                 |

## Tests

```
npm test
```

Runs two suites, neither of which needs a browser or any dependency:

- `tests/engine.test.mjs` — solution grids satisfy every constraint combination,
  cages and thermometers stay consistent with their solution, generated boards
  have exactly one solution, the human solver's answer matches ground truth, and
  the difficulty dial sweeps all five bands on each variant.
- `tests/ui.test.mjs` — runs the entire page script under a minimal DOM shim, so
  dealing, painting, hints, undo, check, the win state and the cage/thermometer
  rendering are all exercised.

The most important assertion is the soundness check at the end of the engine
suite: it walks several hundred real deduction steps and fails if any technique
ever eliminates the true digit. An unsound technique would not throw — it would
quietly produce boards that cannot be solved, and the player would blame
themselves.

```
node tests/calibrate.mjs
```

Samples the grader across clue counts and variants. Useful before changing the
band thresholds in `BANDS` or the technique costs in `TECH`.

## Layout

```
index.html                 the entire game
tests/extract.mjs          pulls the solver out of index.html for testing
tests/engine.test.mjs      generator, solver and grading tests
tests/ui.test.mjs          full page script under a DOM shim
tests/calibrate.mjs        difficulty sampling
```

The tests read the solver out of `index.html` rather than keeping a second copy,
so the shipped game and the tested code can never drift apart.
