## `moraleCheck`

Path: `moraleCheck`

This section configures the morale check after taking damage.

In simple terms: when a unit takes damage, the game checks whether it keeps formation and combat effectiveness, or starts retreating, fleeing, or breaking apart.

The result of the morale check can be:

- `pass` - the unit passes the morale check and continues acting normally
- `retreat` - the unit cannot withstand the pressure and starts retreating
- `flee` - the unit routs and loses combat effectiveness more severely than during a normal retreat
- `disband` - the unit fully breaks apart and leaves the battle

---

## PARAMETERS

The `moraleCheck` section supports:

- `dice` - dice roll settings
- `commander` - penalty if no friendly commander is nearby
- `lossPenalties` - additional penalties for casualties
- `outcomes` - possible morale-check results
- `effects` - what happens after each result

Inside these fields, the main parameters are:

- `dice.count` - how many dice are rolled
- `dice.sides` - how many sides each die has
- `commander.radiusMeters` - radius used to check for a commander
- `commander.penalty` - penalty if no commander is nearby
- `lossPenalties[].lossesMoreThan` - casualty threshold
- `lossPenalties[].penalty` - penalty for exceeding that threshold
- `lossPenalties[].key` - ID or label for this penalty
- `outcomes[].minTotal` - minimum total for that outcome
- `outcomes[].id` - outcome ID (`pass`, `retreat`, `flee`, `disband`)
- `effects.retreatDurationSeconds` - retreat duration
- `effects.fleeDurationMultiplier` - flee duration multiplier
- `effects.fleeHpMultiplier` - HP multiplier when fleeing

---

## FORMAT

```json
{
  "moraleCheck": {
    "dice": { "count": 2, "sides": 6 },
    "commander": { "radiusMeters": 300, "penalty": -2 },
    "lossPenalties": [
      { "lossesMoreThan": 0.25, "penalty": -2, "key": "losses>25%" }
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

---

## HOW IT WORKS

During a morale check, the game:

1. Rolls the dice.
2. Applies the unit's own morale.
3. Checks whether a friendly commander is nearby.
4. Applies penalties for how many losses the unit has taken.
5. Applies other modifiers if they exist, for example from environment or unit type.
6. Compares the final result against the list of `outcomes`.

The worse the final total, the more severe the result.

---

## EXAMPLE

```json
{
  "moraleCheck": {
    "dice": { "count": 2, "sides": 6 },
    "commander": { "radiusMeters": 300, "penalty": -2 },
    "lossPenalties": [
      { "lossesMoreThan": 0.25, "penalty": -2, "key": "losses>25%" }
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

---

## EXAMPLE EXPLANATION

- The game rolls `2` six-sided dice.
- If there is no friendly commander within `300` meters, the unit gets a `-2` penalty.
- If the unit has lost more than `25%`, it gets another `-2` penalty.
- If the final result is `0` or higher, the unit keeps formation (`pass`).
- If the total is lower, more severe outcomes can happen: `retreat`, `flee`, or `disband`.
- `retreat` makes the unit retreat for `43200` seconds.
- `flee` makes the retreat longer and reduces the unit's HP to `50%` of its current value according to `fleeHpMultiplier`.
- `disband` means the unit is completely removed from the battle.

---

## SIMULATION EXAMPLE

Imagine an infantry unit:

- it had `100` HP
- after an attack it has `60` HP left
- that means the unit has lost `40%` of its health
- there is no friendly commander nearby

What happens next:

1. The game starts a morale check after taking damage.
2. It rolls `2d6`.
3. Because losses are greater than `25%`, the penalty from `lossPenalties` is applied.
4. Because no commander is nearby, another penalty is applied.
5. In this example, the unit gets two `-2` penalties, so the total penalty is `-4`.
6. The final morale result is calculated as: `2d6 - 4`.

Then:

- for `pass`, the final total must be `0` or higher, so the `2d6` roll must be `4` or higher
- for `retreat`, the final total must be between `-2` and `-1`, so the `2d6` roll must be `2` or `3`
- `flee` cannot happen in this example, because even the minimum roll of `2` gives a final total of `-2`
- `disband` also cannot happen in this example

This means that in this example, after heavy damage and without commander support, the unit will either keep formation or begin retreating.
