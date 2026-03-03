## `inaccuracy`

Path: `inaccuracy`

Controls how the engine converts 2D target distance + height difference into an inaccuracy radius (used by area / inaccurate fire).

## Shape

`inaccuracy` is an object:

```json
{
  "inaccuracy": {
    "heightFactor": 5.0,
    "distanceFactor": 0.1
  }
}
```

## Keys

- **`heightFactor`** (number, optional): multiplier applied to \((unitHeight - targetHeight)\) before computing the final radius.
- **`distanceFactor`** (number, optional): multiplier applied to horizontal distance (in meters) before computing the final radius.

If a key is missing or not a finite number, the engine uses defaults:

- `heightFactor = 5.0`
- `distanceFactor = 0.1`

