## Resource pack format

Default file: `public/assets/default_resourcepack.json`.

A **resource pack** is a JSON file that defines:

- unit stats and unit-specific parameters (rendering, targeting rules)
- stat multipliers for formations, abilities, environment, time of day, and weather
- combat modifier tables (distance / height angle)
- optional display titles (merged into i18n at runtime)

## Quick start

- Copy `public/assets/default_resourcepack.json` into your own file (keep valid JSON).
- Adjust values.
- Load it using the app logic that calls `loadResourcePack(url)` (see `src/engine/assets/resourcepack.ts`).

## Common concepts

### IDs

Most arrays use an `id` string as a stable key. It should be **unique within its category**:

- `timeOfDay.segments[].id`
- `weather.conditions[].id`
- `environment.states[].id`
- `formations.types[].id`
- `abilities.types[].id`
- `units.types[].id`

### Titles and i18n

If an entry provides a `title`, it is injected into i18n **only if a translation key is missing**.

Injected keys:

- `unit.<id>`
- `ability.<id>`
- `formation.<id>`
- `weather.<id>`
- `env.<id>`
- `time.<id>`

### Stat multipliers (how balancing works)

Most modifiers are multiplicative. A multiplier of:

- `1.0` means “no change”
- `< 1.0` reduces the stat
- `> 1.0` increases the stat

Core stat keys used by the engine (`StatKey`):

- `damage`
- `takeDamageMod`
- `speed`
- `attackRange`
- `visionRange`

Ability multipliers also support:

- `fatigue`

### Normalization / validation (important)

The engine normalizes parts of the JSON at load time:

- invalid entries may be dropped
- non-numeric multipliers are ignored
- distance/angle tables are cleaned and sorted before use

When documenting or editing packs, assume: **only numeric values are applied**.

## Sections

- **Time of day**: [`docs/resourcepack/time-of-day.md`](resourcepack/time-of-day.md)
- **Weather**: [`docs/resourcepack/weather.md`](resourcepack/weather.md)
- **Inaccuracy (radius factors)**: [`docs/resourcepack/inaccuracy.md`](resourcepack/inaccuracy.md)
- **Morale check (retreat/flee/disband)**: [`docs/resourcepack/morale-check.md`](resourcepack/morale-check.md)
- **Environment**: [`docs/resourcepack/environment.md`](resourcepack/environment.md)
- **Formations**: [`docs/resourcepack/formations.md`](resourcepack/formations.md)
- **Abilities**: [`docs/resourcepack/abilities.md`](resourcepack/abilities.md)
- **Units**: [`docs/resourcepack/unit.md`](resourcepack/unit.md)
- **Angle modifiers (height)**: [`docs/resourcepack/angle-modifiers.md`](resourcepack/angle-modifiers.md)
- **Distance modifiers**: [`docs/resourcepack/distance-modifiers.md`](resourcepack/distance-modifiers.md)

