## `inaccuracy`

Path: `inaccuracy`

This section defines inaccuracy for abilities.

For example, it can be used for an artillery ability that does not hit one exact point, but instead scatters within an area.

In simple terms: the higher the inaccuracy, the farther the actual hit can land from the chosen point.

Inaccuracy is affected by:

- distance to the target
- height difference between attacker and target

---

## PARAMETERS

The `inaccuracy` section supports:

- `heightFactor` (optional, number) - how strongly height difference affects inaccuracy
- `distanceFactor` (optional, number) - how strongly target distance affects inaccuracy

If a value is missing or invalid, default values are used:

- `heightFactor`: `5.0`
- `distanceFactor`: `0.1`

---

## FORMAT

```json
{
  "inaccuracy": {
    "heightFactor": 5.0,
    "distanceFactor": 0.1
  }
}
```

Both parameters must be numeric.

---

## EXAMPLE

```json
{
  "inaccuracy": {
    "heightFactor": 6.0,
    "distanceFactor": 0.15
  }
}
```

---

## EXAMPLE EXPLANATION

- `distanceFactor: 0.15` increases inaccuracy at long range.
- `heightFactor: 6.0` increases how much height differences affect inaccuracy.
- This setup can be useful, for example, for an artillery-style area attack where the result should not be perfectly precise.
