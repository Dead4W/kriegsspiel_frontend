## `timeOfDay`

Path: `timeOfDay.segments[]`

Defines named time-of-day segments and (optionally) stat multipliers applied during those segments.

## Segment fields

Each segment is an object with:

- **`id`** (string, required): segment identifier (e.g. `"day"`, `"night"`).
- **`title`** (string, optional): display title. If provided, may be merged into i18n as `time.<id>`.
- **`start`** (number, required): hour start.
- **`end`** (number, required): hour end.
- **`multipliers`** (object, optional): stat multipliers applied to units.

## Time range rules

Segments are interpreted as **half-open** ranges: \([start, end)\).

Special cases:

- If `start < end`: active when `hour >= start && hour < end`
- If `start > end`: wrap-around over midnight, active when `hour >= start || hour < end`
- If `start === end`: always active (full loop)

If no segment matches, the engine falls back to the **first segment** in the array.

## `multipliers`

`multipliers` is a map of stat keys to numeric multipliers:

- `damage`
- `takeDamageMod`
- `speed`
- `attackRange`
- `visionRange`

Missing keys default to `1`.

## Example

```json
{
  "timeOfDay": {
    "segments": [
      { "id": "day", "title": "Day", "start": 9, "end": 19, "multipliers": {} },
      {
        "id": "night",
        "title": "Night",
        "start": 19,
        "end": 9,
        "multipliers": { "visionRange": 0.6, "attackRange": 0.75, "speed": 0.9 }
      }
    ]
  }
}
```

