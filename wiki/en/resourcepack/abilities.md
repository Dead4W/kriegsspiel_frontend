## `abilities`

Path: `abilities.types[]`

These are unit abilities. They are used to define special modes or actions that a unit can use in battle.

For example, an ability can speed up a unit, increase attack power, or set parameters for inaccurate area fire.

---

## PARAMETERS

Each item in `abilities.types[]` supports:

- `id` (required, string) - unique ability ID
- `title` (optional, string) - display name of the ability
- `multipliers` (optional, object) - stat modifiers while the ability is active
- `params` (optional, object) - extra ability-specific parameters

In `multipliers`, you can use standard stat keys:

- `damage`
- `takeDamageMod`
- `speed`
- `attackRange`
- `visionRange`
- `fatigue` (abilities only)

All values must be numeric.

In `params`, the following is supported:

- `radius` (number) - radius multiplier for inaccurate area fire

---

## `multipliers` FORMAT

`multipliers` are modifiers that apply while the ability is active.

```json
{
  "multipliers": {
    "speed": 1.5,
    "fatigue": 2
  }
}
```

For example:

- `speed: 1.5` increases speed to 150%
- `fatigue: 2` doubles fatigue accumulation

---

## `params` FORMAT

`params` are used for extra ability configuration.

```json
{
  "params": {
    "radius": 1.2
  }
}
```

For example, `radius: 1.2` increases the area-fire radius by 20%.

---

## EXAMPLE

```json
{
  "abilities": {
    "types": [
      {
        "id": "charge",
        "title": "Charge",
        "multipliers": {
          "speed": 1.5,
          "fatigue": 2
        }
      },
      {
        "id": "inaccuracy_fire",
        "title": "Area Fire",
        "params": {
          "radius": 1.2
        }
      }
    ]
  }
}
```

---

## EXAMPLE EXPLANATION

- `charge` is a rush or charge ability.
- `speed: 1.5` means the unit moves faster while it is active.
- `fatigue: 2` means the unit gets tired faster in exchange for that speed.
- `inaccuracy_fire` is an inaccurate area-fire ability.
- `radius: 1.2` means the impact radius becomes larger than usual.

---

## ADDITIONAL NOTES

- Ability IDs in `units.types[].abilities` are used as plain IDs.
- If an ability is assigned to a unit but is not defined in `abilities.types[]`, no special multipliers or params from this section will be applied.
