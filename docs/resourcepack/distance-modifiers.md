## `distanceModifiers`

Path: `distanceModifiers`

Defines damage multipliers by distance. The structure allows multiple tables keyed by string (commonly `default` and type-specific tables like `artillery`).

## Shape

`distanceModifiers` is an object:

```json
{
  "distanceModifiers": {
    "default": [{ "distance": 200, "modifier": 1.0 }],
    "artillery": [{ "distance": 800, "modifier": 1.0 }]
  }
}
```

Each table is an array of points:

- **`distance`** (number, required): meters (must be \(>= 0\)).
- **`modifier`** (number, required): damage multiplier (must be \(> 0\)).

The engine cleans and sorts each table by `distance`.

## Lookup rules

When computing a modifier for a unit type, the engine tries:

1. table with key equal to `unit.type`
2. fallback to table `default`
3. if no table exists → `1`

## Interpolation & extrapolation

- If `distance` is below the first point → use the first point modifier.
- If `distance` is between two points → linear interpolation.
- If `distance` is above the last point:
  - every extra 100m halves the modifier (exponential decay): `last.modifier / 2^steps`

## Example

```json
{
  "distanceModifiers": {
    "default": [
      { "distance": 50, "modifier": 1.6 },
      { "distance": 200, "modifier": 1.0 },
      { "distance": 1000, "modifier": 0.11 }
    ],
    "artillery": [
      { "distance": 800, "modifier": 1.0 },
      { "distance": 4500, "modifier": 0.03 }
    ]
  }
}
```

