## `angleModifiers` (height / angle damage modifier)

Path: `angleModifiers[]`

Defines a piecewise-linear table that maps **angle (degrees)** to a **damage modifier**. The angle is computed from attacker height, target height, and horizontal distance.

## Entry fields

Each entry is an object with:

- **`angle`** (number, required): angle in degrees.
- **`modifier`** (number, required): damage multiplier at this angle.

Entries are cleaned and sorted by `angle`.

## Interpolation rules

- If `angle` is below the smallest table angle → use the first modifier.
- If `angle` is above the largest table angle → use the last modifier.
- If `angle` is between two points → linear interpolation.

## Example

```json
{
  "angleModifiers": [
    { "angle": -6, "modifier": 0.5 },
    { "angle": -5, "modifier": 0.7 },
    { "angle": -3, "modifier": 0.85 },
    { "angle": 0, "modifier": 1.0 }
  ]
}
```

