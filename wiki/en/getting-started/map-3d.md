# 3D map (object map + object meta)

![3D map fields example](/assets/wiki/first-room-3d-map-example.png)

`Object map URL` and `Object meta URL` are used to generate 3D environment objects: forests, roads, rivers, bridges, and buildings.

## Why this is needed

- Without `object map` + `object meta`, 3D maps lose environment detail.
- These files drive both visual scene generation and helper layers (for example, forests).
- The fields must be used as a pair: if one is set, the other is required.

## Object map URL

- Direct link to an object mask (PNG/JPEG).
- Use the same resolution as `Map URL` to avoid offsets.
- Paint each object type with a solid RGB color (no gradients, no antialiasing).

## Object meta URL

- Direct link to JSON with `entity_to_color`.
- `entity_to_color` maps `entity name -> RGB color`.

Minimal example:

```json
{
  "entity_to_color": {
    "forest": [234, 20, 255],
    "road": [20, 255, 38],
    "good_road": [107, 20, 255],
    "river": [255, 20, 71],
    "bridge": [255, 175, 20],
    "building": [20, 139, 255],
    "red_building": [208, 255, 20]
  }
}
```

## `default_map_objects` mask example

![Default map objects example](/assets/default_map_objects.png)

On this mask, each color corresponds to an entity from `entity_to_color`. Colors must match exactly.

## Quick preparation flow

1. Create a separate object mask with the same size as your base map.
2. Paint object areas using colors from your `entity_to_color`.
3. Save the mask as PNG/JPEG and metadata as JSON.
4. Host both files with direct URLs.
5. Paste both URLs into `Custom map` when creating a room.
