## `distanceModifiers`

Path: `distanceModifiers`

This section defines how damage changes depending on shooting distance.

You can use it to configure:

- one shared table for all units through `default`
- separate tables for specific unit types such as `artillery`, `cavalry`, and others

---

## PARAMETERS

`distanceModifiers` is an object where each key contains a distance table for a particular unit type.

Example:

```json
{
  "distanceModifiers": {
    "default": [{ "distance": 200, "modifier": 1.0 }],
    "artillery": [{ "distance": 800, "modifier": 1.0 }]
  }
}
```

Each table is an array of points. Each point has two fields:

- `distance` (required, number) - distance in meters, must be `>= 0`
- `modifier` (required, number) - damage multiplier at that distance, must be `> 0`

If a table contains invalid points, those points are discarded. Valid points are automatically sorted by distance.

---

## HOW THE TABLE IS SELECTED

When a unit attacks, the game looks for a matching table in this order:

1. A table whose name exactly matches the unit type.
2. The `default` table.
3. If nothing is found, the multiplier `1` is used.

This makes it possible to define shared rules for everyone and override them only for selected units.

---

## HOW THE MODIFIER IS CALCULATED

- If the distance is less than or equal to the first point, the modifier of the first point is used.
- If the distance is between two points, the game calculates an intermediate value by linear interpolation.
- If the distance is greater than the last point, exponential decay is used.

For distances beyond the last point, a separate rule applies:

- every additional 100 meters halves the last modifier
- the formula is: `last.modifier / 2^steps`

This means that once the shot goes beyond the end of the table, damage keeps dropping more and more sharply.

---

## EXAMPLE

```json
{
  "distanceModifiers": {
    "default": [
      { "distance": 50, "modifier": 1.4 },
      { "distance": 250, "modifier": 1.0 },
      { "distance": 1000, "modifier": 0.2 }
    ],
    "artillery": [
      { "distance": 700, "modifier": 1.0 },
      { "distance": 4000, "modifier": 0.05 }
    ]
  }
}
```

What this example means:

- Up to `50` meters, regular units deal `140%` damage.
- At `250` meters, damage becomes normal, which is `100%`.
- By `1000` meters, damage drops to `20%`.
- `artillery` uses a separate table, so artillery follows its own distances instead of `default`.
