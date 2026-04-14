## `units`

Path: `units.types[]`

These are unit types. This section defines every unit that can be used in the game.

For example, you can describe infantry, artillery, a general, or other troop types here.

---

## PARAMETERS

Each entry in `units.types[]` supports:

- `id` (required, string) - unique unit type ID (`"infantry"`, `"artillery"`, etc.)
- `title` (optional, string) - display name of the unit
- `stats` (required, object) - base numeric stats
- `abilities` (optional, string[]) - ability IDs available to this unit
- `defaultFormation` (optional, string) - formation ID from `formations.types[]`
- `params` (optional, object) - extra behavior and rendering settings

---

## REQUIRED STATS

All fields below are required and must be numeric:

- `maxHp`
- `damage`
- `speed`
- `takeDamageMod`
- `attackRange`
- `visionRange`
- `ammoMax`

If at least one required stat is missing or invalid, that unit will not work correctly.

---

## `params` PARAMETERS

You can use `params` for additional settings.

For rendering:

- `textureUrl` (string) - path to sprite/texture
- `renderIcon` (string) - fallback symbol if the texture is unavailable
- `renderWidthMult` (number, default `1`) - multiplier for unit image width
- `renderHeightMult` (number, default `1`) - multiplier for unit image height

For combat and targeting:

- `priorityTargets` (number) - attack command selects only the nearest N targets
- `attackIgnoreHeightModifier` (boolean) - disables height-angle damage modifier for this attacker
- `attackIgnoreTargetEnvs` (string[]) - target environment IDs that trigger a special multiplier
- `attackIgnoreTargetEnvMult` (number, default `2`) - applied when the target environment matches

For morale:

- `moraleCheckMod` (number) - unit type modifier used in morale checks

If `textureUrl` is a relative path, it is resolved relative to the loaded ResourcePack.

---

## `stats` FORMAT

`stats` are the base characteristics of a unit.

```json
{
  "stats": {
    "maxHp": 64,
    "damage": 1,
    "speed": 80,
    "takeDamageMod": 1,
    "attackRange": 2000,
    "visionRange": 1000,
    "ammoMax": 10
  }
}
```

These values define the foundation of the unit, and then formations, environment, weather, and abilities can modify them.

---

## ADDITIONAL NOTES

Spawn UI follows the order in `units.types[]`, then ensures safe defaults exist:

- it always includes `general`
- it internally ensures `messenger`, but `messenger` is not shown in the regular spawn list order

---

## EXAMPLE

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
        "defaultFormation": "line",
        "params": {
          "priorityTargets": 3,
          "renderIcon": "I",
          "textureUrl": "units/infantry.png"
        }
      }
    ]
  }
}
```

---

## EXAMPLE EXPLANATION

- `infantry` is the unit type for infantry.
- `stats` define its base health, damage, speed, attack range, vision, and ammunition.
- `abilities: ["double_time_move"]` means this unit can use that ability.
- `defaultFormation: "line"` means the unit spawns or acts in the `line` formation by default.
- `priorityTargets: 3` means the unit only considers the nearest targets within that limit when attacking.
- `renderIcon: "I"` defines a simple fallback display symbol.
- `textureUrl: "units/infantry.png"` defines the unit image.
