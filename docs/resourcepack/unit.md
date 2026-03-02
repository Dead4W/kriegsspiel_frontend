## `units`

Path: `units.types[]`

Defines unit types, their base stats, default abilities, optional default formation, and parameters used by rendering and combat rules.

## Unit type fields

Each unit type is an object with:

- **`id`** (string, required): unit type id (e.g. `"infantry"`, `"artillery"`).
- **`title`** (string, optional): display title. If provided, may be merged into i18n as `unit.<id>`.
- **`stats`** (object, required): base numeric stats (all keys required).
- **`abilities`** (string array, optional): ability ids available to this unit type.
- **`defaultFormation`** (string, optional): formation id used by default.
- **`params`** (object, optional): free-form parameters used by engine/UI.

## `stats` (required)

All keys below must exist and be numeric:

- `maxHp`
- `damage`
- `speed`
- `takeDamageMod`
- `attackRange`
- `visionRange`
- `ammoMax`

## `abilities`

Array of ability ids (strings). Unknown ids are simply treated as ids; ability effects depend on definitions in `abilities.types[]`.

## `defaultFormation`

String id referencing a formation from `formations.types[]`.

## `params`

The engine reads several known keys from `params`.

### Rendering params

- **`textureUrl`** (string): texture URL/path for the unit.
  - absolute URLs (`https:`, `data:`, `blob:`...) are kept as-is
  - absolute site paths (`"/assets/..."`) are kept as-is
  - relative paths (`"units/infantry.png"`) are resolved relative to the loaded resourcepack JSON URL
- **`renderIcon`** (string): fallback text icon rendered when texture is missing/unloaded.
- **`renderWidthMult`** (number, default `1`): width multiplier for unit body rendering.
- **`renderHeightMult`** (number, default `1`): height multiplier for unit body rendering.

### Targeting / combat params

- **`priorityTargets`** (number): if set, limits attack command to the nearest N targets.
- **`attackIgnoreHeightModifier`** (boolean): if `true`, disables height-based damage modifier for this attacker.
- **`attackIgnoreTargetEnvs`** (string array): environment state ids; if the target is in any of them, apply `attackIgnoreTargetEnvMult`.
- **`attackIgnoreTargetEnvMult`** (number, default `2`): multiplier applied when `attackIgnoreTargetEnvs` matches.

### Morale params

- **`moraleCheckMod`** (number): contributes to morale/stability checks for this unit type.

## Spawn list note

The spawn UI prefers the order from `units.types[]`, and always ensures the `general` unit exists as a safe default.

## Example

```json
{
  "units": {
    "types": [
      {
        "id": "infantry",
        "title": "Infantry",
        "stats": {
          "maxHp": 64,
          "damage": 1,
          "speed": 80,
          "takeDamageMod": 1,
          "attackRange": 2000,
          "visionRange": 1000,
          "ammoMax": 10
        },
        "abilities": ["double_time_move"],
        "params": { "priorityTargets": 3, "renderIcon": "I", "textureUrl": "/assets/units/infantry.png" }
      }
    ]
  }
}
```

