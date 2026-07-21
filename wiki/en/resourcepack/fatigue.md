## `fatigue`

Path: `fatigue`

Fatigue is an optional room rule. When the room's **Fatigue** setting is enabled, units accumulate fatigue while moving and fighting. It reduces their damage and can reduce their speed.

Fatigue is clamped between `0` and `max`.

---

## FORMAT

```json
{
  "fatigue": {
    "max": 10,
    "attackHoursPerPoint": 1,
    "moveHoursPerPoint": 0.5,
    "recoveryPerHour": 1,
    "attackedRecoveryMultiplier": 0.5,
    "damageCurvePower": 5,
    "speedThresholds": [
      { "moreThan": 5, "multiplier": 0.8 },
      { "moreThan": 8, "multiplier": 0.6 }
    ]
  }
}
```

## GLOBAL PARAMETERS

- `max` - maximum fatigue.
- `attackHoursPerPoint` - hours of active combat needed to gain one point of fatigue.
- `moveHoursPerPoint` - hours of actual movement needed to gain one point of fatigue.
- `recoveryPerHour` - fatigue removed per idle hour.
- `attackedRecoveryMultiplier` - recovery multiplier during a turn step in which the unit took damage.
- `damageCurvePower` - shape of the damage penalty curve.
- `speedThresholds` - ordered fatigue thresholds. The first threshold exceeded by the unit applies its `multiplier` to speed.

Movement and combat may happen in the same step; their fatigue gains are added. A unit recovers only when it neither moves nor attacks. Retreating units do not recover fatigue.

## DAMAGE CURVE

The damage multiplier is calculated as:

```text
1 - (fatigue / max) ^ damageCurvePower
```

At maximum fatigue, damage is always `0`. A power greater than `1` keeps the early penalty small and makes the loss steeper near the maximum.

![Damage multiplier curves for different power values](/assets/wiki/fatigue-power.png)

## PER-UNIT MODIFIERS

These numeric parameters may be set on `units.types[].params`:

- `fatigueAccumMult` - multiplies fatigue gained from movement and combat.
- `fatigueRecoveryMult` - multiplies fatigue recovered while idle.

For example, marines that tire at half the normal rate:

```json
{
  "id": "marine",
  "params": {
    "fatigueAccumMult": 0.5
  }
}
```

## FORMATIONS AND ABILITIES

Set `multipliers.fatigue` on a formation or ability to multiply fatigue gain while it is active.

```json
{
  "id": "onHorse",
  "multipliers": {
    "fatigue": 0.5
  }
}
```

This is also how ability fatigue multipliers work: `fatigue: 2` makes the active ability double fatigue accumulation.

## ENVIRONMENT

Environment states support both parameters:

- `params.fatigueAccumMult`
- `params.fatigueRecoveryMult`

For a house that halves fatigue gain and doubles recovery:

```json
{
  "id": "in_house",
  "params": {
    "fatigueAccumMult": 0.5,
    "fatigueRecoveryMult": 2
  }
}
```
