## `weather`

Path: `weather.conditions[]`

These are weather conditions. They are used for global stat modifiers, for example to reduce vision in fog or reduce attack range in bad weather.

Weather can also enable a visual effect so the player can see the current map condition.

---

## PARAMETERS

Each item in `weather.conditions[]` supports:

- `id` (required, string) - unique weather ID (`clear`, `fog`, etc.)
- `title` (optional, string) - display name of the weather
- `multipliers` (optional, object) - stat modifiers while this weather is active
- `effect` (optional, object) - visual weather effect

The `effect` parameter supports these forms:

- `{"type": "fog", "mult": 1.0}` - fog effect
- `{"type": "clouds"}` - clouds effect

---

## `multipliers` FORMAT

`multipliers` are an object with numeric stat modifiers.

```json
{
  "multipliers": {
    "visionRange": 0.7,
    "attackRange": 0.85
  }
}
```

You can use standard modifier keys such as:
`damage`, `takeDamageMod`, `speed`, `attackRange`, `visionRange`.

All values must be numeric.

---

## EXAMPLE

```json
{
  "weather": {
    "conditions": [
      {
        "id": "clear",
        "title": "Clear",
        "multipliers": {}
      },
      {
        "id": "fog",
        "title": "Fog",
        "multipliers": {
          "visionRange": 0.6,
          "attackRange": 0.8
        },
        "effect": {
          "type": "fog",
          "mult": 1.1
        }
      }
    ]
  }
}
```

---

## EXAMPLE EXPLANATION

- `clear` is regular clear weather with no modifiers.
- `fog` is fog that changes unit stats.
- `visionRange: 0.6` reduces vision to 60% of the base value.
- `attackRange: 0.8` reduces attack range to 80% of the base value.
- `effect.type: "fog"` enables the visual fog effect.
- `effect.mult: 1.1` sets the intensity of that effect.
