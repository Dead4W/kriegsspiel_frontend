# First room

## Advanced settings

### Game date

- Start date and time of the match.
- Format: `YYYY-MM-DD HH:mm:ss` (example: `1882-06-12 09:00:00`).

### Resource pack

- **Resource pack URL** - link to a JSON with balance and modifiers.
- You can keep the default URL.

### Map

- `Essex 1882` and `Saint-Petersburg 1828` are ready-to-use presets.
- `Custom map` lets you use your own map.

For `Custom map`:

- **Map URL** - direct link to the map image.
- **Meters per pixel** - map scale.

### Elevation map URL (optional)

- Link to the **height map**: a separate image where pixel brightness corresponds to terrain height.
- If you have a source `.tiff` elevation map, you can prepare it by coordinates using:
  [generate_height_map.py](https://github.com/Dead4W/kriegsspiel_backend/blob/main/helpers/generate_height_map.py).

## Room parameters

### Team names

- **Red team name** - name of the Red side in the interface.
- **Blue team name** - name of the Blue side in the interface.

### Information and reports

- **General updates information in direct line of sight** - if the general visually sees a unit on the map, that unit is synchronized on player boards. This applies to both friendly and enemy units.
- **Automatic stats update** - when the general receives a report, the board updates the unit that sent it (position, HP, ammo, and other current stats).

### Combat modifiers

- **Time-of-day modifiers** - unit characteristics depend on time.
- **Weather modifiers** - unit characteristics depend on weather.

### Map and logistics

- **Personal player maps** - each player has their own board. If the Red side has more than one player, they will have different tokens, chat, and context. A player only sees and updates their own board.
- **Ammo is not infinite** (`BETA`) - units have limited ammunition.

## How to invite friends

1. After entering a room, open the **Umpire** tab in the top-left.
2. There are copy-link buttons for `umpire`, `red`, and `blue`.
3. Send each participant only their own link.
4. Red/Blue players cannot access other boards; full access belongs only to the Umpire.
