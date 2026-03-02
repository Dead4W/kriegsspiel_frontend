## `abilities`

Path: `abilities.types[]`

Defines unit ability types, their stat multipliers, and ability parameters.

## Ability fields

Each ability is an object with:

- **`id`** (string, required): ability identifier (e.g. `"charge"`).
- **`title`** (string, optional): display title. If provided, may be merged into i18n as `ability.<id>`.
- **`multipliers`** (object, optional): stat multipliers applied while the ability is active.
- **`params`** (object, optional): ability-specific parameters.

## `multipliers`

Supported keys:

- `damage`
- `takeDamageMod`
- `speed`
- `attackRange`
- `visionRange`
- `fatigue` (ability-only)

Values must be numeric; non-numeric values are ignored.

## `params`

Currently supported:

- **`radius`** (number, optional): multiplies computed inaccuracy radius for “area fire” (artillery inaccuracy targeting).

## Example

```json
{
  "abilities": {
    "types": [
      { "id": "charge", "title": "Charge", "multipliers": { "speed": 5, "fatigue": 4 } },
      { "id": "inaccuracy_fire", "title": "Area fire", "params": { "radius": 1 } }
    ]
  }
}
```

