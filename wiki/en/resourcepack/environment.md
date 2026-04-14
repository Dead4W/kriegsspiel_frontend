## `environment`

Path: `environment.states[]`

These are environment states. They describe how terrain, cover, or fortifications affect units.

For example, a forest can slow movement and reduce incoming damage, while a house can provide cover and help a unit hold morale better.

---

## PARAMETERS

Each item in `environment.states[]` supports:

- `id` (required, string) - unique environment state ID, for example `in_forest`
- `title` (optional, string) - display name of the state
- `icon` (optional, string) - short icon or label for the UI
- `isRoute` (optional, boolean) - marks the state as road-related
- `params` (optional, object) - extra parameters for specific gameplay systems
- `multipliers` (optional, object) - general stat modifiers
- `byTypes` (optional, object) - separate modifiers for specific unit types

In `multipliers` and `byTypes`, you can use standard stat keys:

- `damage`
- `takeDamageMod`
- `speed`
- `attackRange`
- `visionRange`

All values must be numeric.

In `params`, the engine uses:

- `moraleCheckMod` - morale-check modifier from this environment state

If multiple environment states with `moraleCheckMod` affect a unit, the game uses the strongest value by absolute magnitude.

---

## `multipliers` FORMAT

`multipliers` are generic modifiers that apply to all units in this environment state.

```json
{
  "multipliers": {
    "takeDamageMod": 0.6,
    "speed": 0.8
  }
}
```

For example:

- `takeDamageMod: 0.6` reduces incoming damage to 60%
- `speed: 0.8` reduces movement speed to 80%

---

## `byTypes` FORMAT

`byTypes` lets you define separate values for specific unit types.

```json
{
  "byTypes": {
    "artillery": {
      "speed": 0.5
    }
  }
}
```

This means artillery will use its own speed value in that environment.

If the same stat is defined in both `multipliers` and `byTypes`, the value from `byTypes` is used for that unit type.

---

## EXAMPLE

```json
{
  "environment": {
    "states": [
      {
        "id": "in_forest",
        "title": "Forest",
        "icon": "F",
        "isRoute": true,
        "multipliers": {
          "takeDamageMod": 0.6,
          "speed": 0.8
        },
        "byTypes": {
          "artillery": {
            "speed": 0.5
          }
        }
      },
      {
        "id": "in_house",
        "title": "House",
        "icon": "H",
        "params": {
          "moraleCheckMod": 2
        },
        "multipliers": {
          "takeDamageMod": 0.4
        }
      }
    ]
  }
}
```

---

## EXAMPLE EXPLANATION

- `in_forest` describes a unit being in a forest.
- `takeDamageMod: 0.6` means the unit takes less damage in a forest.
- `speed: 0.8` means the unit moves more slowly in a forest.
- `artillery` also has `speed: 0.5`, so artillery moves even more slowly there than other units.
- `in_house` describes a unit being inside a house or cover.
- `takeDamageMod: 0.4` means the unit is protected better there and only takes 40% incoming damage.
- `moraleCheckMod: 2` means the cover helps the unit perform better in morale checks.
