## `formations`

Path: `formations.types[]`

These are unit formations. They are used to define different formation modes and how they affect stats.

For example, one formation may give more speed, while another improves attack effectiveness.

---

## PARAMETERS

Each item in `formations.types[]` supports:

- `id` (required, string) - unique formation ID
- `title` (optional, string) - display name of the formation
- `icon` (optional, string) - short icon or label for the UI
- `multipliers` (optional, object) - stat modifiers for this formation

In `multipliers`, you can use standard stat keys:

- `damage`
- `takeDamageMod`
- `speed`
- `attackRange`
- `visionRange`

All values must be numeric.

---

## `multipliers` FORMAT

`multipliers` are stat modifiers that apply while the unit is in this formation.

```json
{
  "multipliers": {
    "speed": 1.2,
    "damage": 0.9
  }
}
```

For example:

- `speed: 1.2` increases speed to 120%
- `damage: 0.9` reduces damage to 90%

---

## EXAMPLE

```json
{
  "formations": {
    "types": [
      {
        "id": "line",
        "title": "Line",
        "icon": "L",
        "multipliers": {
          "damage": 1.1
        }
      },
      {
        "id": "column",
        "title": "Column",
        "icon": "C",
        "multipliers": {
          "speed": 1.25,
          "takeDamageMod": 1.2
        }
      }
    ]
  }
}
```

---

## EXAMPLE EXPLANATION

- `line` is a formation that increases damage.
- `damage: 1.1` means the unit deals 110% of its base damage in this formation.
- `column` is a formation that helps the unit move faster.
- `speed: 1.25` means the unit moves 25% faster in column.
- `takeDamageMod: 1.2` means the unit receives 120% incoming damage in column, so it becomes more vulnerable.
