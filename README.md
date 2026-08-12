# Diabolical Sudoku


---

## Rules

| Rule | Constraint |
| --- | --- |
| Diagonal (X) | Both long diagonals hold 1–9 |
| Anti-knight | Cells a knight's move apart cannot share a digit |
| Anti-king | Cells touching, even diagonally, cannot share a digit |
| Killer cages | Cages sum to their total and hold no repeats |
| Thermometers | Digits increase strictly from bulb to tip |


---

## Tests

```bash
npm test          # engine + UI          ~10s
npm run test:all  # adds robustness      ~55s
```

---

## Layout

```
index.html               
tests/extract.mjs        lifts the solver out of index.html
tests/engine.test.mjs    generation, solving, grading
tests/ui.test.mjs        the full page under a DOM shim
tests/robustness.test.mjs  rule-combination sweep, determinism, fuzz
tests/calibrate.mjs      difficulty sampling
```
