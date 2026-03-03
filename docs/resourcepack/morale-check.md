## `moraleCheck`

Path: `moraleCheck`

Controls the morale/stability check that can automatically apply **Retreat**, **Flee**, or **Disband** after taking damage (implemented in `BaseUnit.autoSetRetreatCommandFromAttack()`).

## Shape

```json
{
  "moraleCheck": {
    "dice": { "count": 2, "sides": 6 },
    "commander": { "radiusMeters": 300, "penalty": -2 },
    "lossPenalties": [
      { "lossesMoreThan": 0.25, "penalty": -2, "key": "losses>25%" },
      { "lossesMoreThan": 0.35, "penalty": -1, "key": "losses>35%" },
      { "lossesMoreThan": 0.5, "penalty": -2, "key": "losses>50%" }
    ],
    "outcomes": [
      { "minTotal": 0, "id": "pass" },
      { "minTotal": -2, "id": "retreat" },
      { "minTotal": -5, "id": "flee" },
      { "minTotal": -9999, "id": "disband" }
    ],
    "effects": {
      "retreatDurationSeconds": 43200,
      "fleeDurationMultiplier": 2,
      "fleeHpMultiplier": 0.5
    }
  }
}
```

## Rules (engine behavior)

- **Dice**: rolls `dice.count` times `d(dice.sides)` and sums them.
- **Modifiers** are added to the dice sum:
  - `morale` (unit stat) is always included.
  - `fortification` comes from environment (`environment.states[].params.moraleCheckMod`).
  - `commander.penalty` is applied if there is **no** friendly General within `commander.radiusMeters` (Generals are always considered to have a commander).
  - each `lossPenalties[]` entry applies when `lossFraction > lossesMoreThan` (lossFraction is \(1 - hp/maxHp\)).
  - per-unit type modifier comes from `units.types[].params.moraleCheckMod`.

- **Outcome**: the engine picks the first entry (after sorting by `minTotal` descending) where `total >= minTotal`.
  - Valid `id` values: `pass`, `retreat`, `flee`, `disband`.

- **Effects**:
  - `pass`: nothing happens.
  - `retreat`: sets a `Retreat` command for `effects.retreatDurationSeconds`.
  - `flee`: same as retreat, but duration is multiplied by `effects.fleeDurationMultiplier`, and HP is multiplied by `effects.fleeHpMultiplier`.
  - `disband`: unit HP becomes 0.

If any value is missing/invalid, the engine falls back to the defaults shown above.

