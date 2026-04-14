## `angleModifiers`

Path: `angleModifiers[]`

These are attack-angle modifiers. They are used to change damage depending on whether a unit attacks uphill, downhill, or across flat ground.

For example, you can make downhill attacks stronger and uphill attacks weaker.

The angle is calculated from:

- attacker height
- target height
- horizontal distance

---

## PARAMETERS

Each item in `angleModifiers[]` supports:

- `angle` (required, number) - angle in degrees
- `modifier` (required, number) - damage multiplier for that angle

In simple terms:

- negative `angle` means the attack goes uphill
- `angle = 0` means the target is roughly at the same height
- positive `angle` means the attack goes downhill

---

## FORMAT

```json
{
  "angleModifiers": [
    { "angle": -6, "modifier": 0.5 },
    { "angle": -3, "modifier": 0.8 },
    { "angle": 0, "modifier": 1.0 },
    { "angle": 4, "modifier": 1.2 }
  ]
}
```

Each entry defines a point on the angle scale.

---

## HOW IT WORKS

- if the angle is smaller than the minimum value in the table, the first modifier is used
- if the angle is greater than the maximum value, the last modifier is used
- if the angle is between two points, the game calculates an intermediate value

If the table is empty, the multiplier `1.0` is used.

---

## EXAMPLE

```json
{
  "angleModifiers": [
    { "angle": -6, "modifier": 0.5 },
    { "angle": -3, "modifier": 0.8 },
    { "angle": 0, "modifier": 1.0 },
    { "angle": 4, "modifier": 1.2 }
  ]
}
```

---

## EXAMPLE EXPLANATION

- `angle: -6` and `modifier: 0.5` mean that a steep uphill attack reduces damage to 50%.
- `angle: -3` and `modifier: 0.8` mean that a gentler uphill attack reduces damage to 80%.
- `angle: 0` and `modifier: 1.0` mean normal damage with no changes.
- `angle: 4` and `modifier: 1.2` mean that a downhill attack increases damage to 120%.
- If the actual angle is, for example, between `0` and `4`, the game uses an interpolated value between `1.0` and `1.2`.
