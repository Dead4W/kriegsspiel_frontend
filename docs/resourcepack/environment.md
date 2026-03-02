## `environment`

Path: `environment.states[]`

Defines environment “states” (terrain / cover / fortifications) and their impact on unit stats. States can also carry extra parameters used by game rules (e.g. morale checks).

## State fields

Each state is an object with:

- **`id`** (string, required): environment state identifier (e.g. `"in_forest"`).
- **`title`** (string, optional): display title. If provided, may be merged into i18n as `env.<id>`.
- **`icon`** (string, optional): icon shown in UI (emoji or short string).
- **`isRoute`** (boolean, optional): whether it is considered a “route” state (used by route UI).
- **`params`** (object, optional): free-form parameters used by rules/UI.
- **`multipliers`** (object, optional): stat multipliers for all unit types.
- **`byTypes`** (object, optional): per-unit-type overrides for multipliers.

## `multipliers`

Supported stat keys:

- `damage`
- `takeDamageMod`
- `speed`
- `attackRange`
- `visionRange`

Values must be numeric; non-numeric values are ignored.

## `byTypes`

Shape: `{ [unitTypeId: string]: { [statKey: string]: number } }`.

- Only unit types known to the game (the `unitType` enum) are applied.
- Each per-type object supports the same stat keys as `multipliers`.

If a per-type multiplier exists for a stat, it overrides the generic `multipliers` value for that stat.

## `params`

Currently used by the engine:

- **`moraleCheckMod`** (number): contributes to morale/stability checks; the engine picks the strongest (by absolute value) across active environment states.

Other keys may exist for UI/experiments; unknown keys are ignored by engine logic unless referenced in code.

## Example

```json
{
  "environment": {
    "states": [
      {
        "id": "in_forest",
        "title": "Forest",
        "icon": "🌲",
        "isRoute": true,
        "multipliers": { "takeDamageMod": 0.5, "speed": 0.5 },
        "byTypes": { "artillery": { "speed": 0.25 } }
      },
      {
        "id": "in_house",
        "title": "House",
        "icon": "🏢",
        "params": { "moraleCheckMod": 2 },
        "multipliers": { "takeDamageMod": 0.25 }
      }
    ]
  }
}
```

