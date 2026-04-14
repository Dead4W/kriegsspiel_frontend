## `timeOfDay`

Path: `timeOfDay.segments[]`

These are time-of-day segments. They are used for time-based modifiers, for example to reduce vision at night.

Ranges work as a half-open interval: `[start, end)`.

Example: `start = 9`, `end = 14` means the range starts at `09:00` and ends at `13:59`.

---

## PARAMETERS

Each item in `timeOfDay.segments[]` supports:

- `id` (required, string) - unique segment ID (`day`, `night`, etc.)
- `title` (optional, string) - display name of the segment
- `start` (required, number) - start hour of the segment
- `end` (required, number) - end hour of the segment
- `multipliers` (optional, object) - modifiers applied in this segment

Additional range rules:

- `start < end` - normal range within the same day
- `start > end` - range that crosses midnight
- `start === end` - segment is always active

---

## `multipliers` FORMAT

`multipliers` is an object of groups with numeric stat modifiers.

```json
{
  "multipliers": {
    "default": {
      "visionRange": 0.7
    }
  }
}
```

Inside a group, you can use standard modifier keys such as:
`damage`, `takeDamageMod`, `speed`, `attackRange`, `visionRange`.

---

## EXAMPLE

```json
{
  "timeOfDay": {
    "segments": [
      {
        "id": "day",
        "title": "Day",
        "start": 8,
        "end": 20,
        "multipliers": {
          "default": {}
        }
      },
      {
        "id": "night",
        "title": "Night",
        "start": 20,
        "end": 8,
        "multipliers": {
          "default": {
            "visionRange": 0.6,
            "attackRange": 0.85
          }
        }
      }
    ]
  }
}
```

---

## EXAMPLE EXPLANATION

- The `day` segment is active from `08:00` to `19:59`, with no modifiers.
- The `night` segment is active from `20:00` to `07:59`, crossing midnight.
- At night, `visionRange: 0.6` reduces vision to 60% of the base value.
- At night, `attackRange: 0.85` reduces attack range to 85% of the base value.
