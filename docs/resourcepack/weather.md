## `weather`

Path: `weather.conditions[]`

Defines weather conditions, their stat multipliers, and optional visual effects.

## Condition fields

Each condition is an object with:

- **`id`** (string, required): weather identifier (e.g. `"clear"`, `"fog"`).
- **`title`** (string, optional): display title. If provided, may be merged into i18n as `weather.<id>`.
- **`multipliers`** (object, optional): stat multipliers applied to units.
- **`effect`** (object, optional): visual effect configuration.

## `multipliers`

Supported stat keys:

- `damage`
- `takeDamageMod`
- `speed`
- `attackRange`
- `visionRange`

Non-numeric values are ignored. Missing keys default to `1`.

## `effect`

Supported effect shapes:

- **Fog**:
  - `{ "type": "fog", "mult": 1.2 }`
  - `mult` (number, optional) controls intensity (implementation-specific).
- **Clouds**:
  - `{ "type": "clouds" }`

Unknown `type` values are ignored by the engine.

## Example

```json
{
  "weather": {
    "conditions": [
      { "id": "clear", "title": "Clear", "multipliers": {} },
      {
        "id": "fog",
        "title": "Fog",
        "multipliers": { "visionRange": 0.5, "attackRange": 0.6 },
        "effect": { "type": "fog", "mult": 1.0 }
      }
    ]
  }
}
```

