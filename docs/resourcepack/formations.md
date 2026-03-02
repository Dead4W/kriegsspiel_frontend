## `formations`

Path: `formations.types[]`

Defines formation types, their icons, and stat multipliers.

## Formation fields

Each formation is an object with:

- **`id`** (string, required): formation identifier (e.g. `"column"`).
- **`title`** (string, optional): display title. If provided, may be merged into i18n as `formation.<id>`.
- **`icon`** (string, optional): icon shown in UI (emoji or short string).
- **`multipliers`** (object, optional): stat multipliers applied while the formation is active.

## `multipliers`

Supported stat keys:

- `damage`
- `takeDamageMod`
- `speed`
- `attackRange`
- `visionRange`

Values must be numeric; non-numeric values are ignored.

## Example

```json
{
  "formations": {
    "types": [
      { "id": "default", "title": "Default", "multipliers": {} },
      { "id": "column", "title": "Column", "icon": "C", "multipliers": { "takeDamageMod": 16.0 } }
    ]
  }
}
```

