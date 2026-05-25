import type { vec2 } from "@/engine/types";
import type { BaseUnit } from "@/engine/units/baseUnit";
import { computeInaccuracyRadius } from "@/engine/units/modifiers/UnitInaccuracyModifier";
import type {
  OverlayCircle,
  OverlayItem,
  OverlayLine,
} from "@/engine/types/overlayTypes";

interface BuildAttackOverlayItemsOptions {
  attackers: Array<{ pos: vec2 }>;
  targets: Array<{ pos: vec2 }>;
  inaccuracyPoint: vec2 | null;
  inaccuracyEnabled: boolean;
  radiusModifier: number;
  inaccuracyRadiusMultiplier: number;
  metersPerPixel: number;
}

export function buildAttackOverlayItems(
  options: BuildAttackOverlayItemsOptions
): OverlayItem[] {
  const {
    attackers,
    targets,
    inaccuracyPoint,
    inaccuracyEnabled,
    radiusModifier,
    inaccuracyRadiusMultiplier,
    metersPerPixel,
  } = options;

  const items: OverlayItem[] = [];

  if (inaccuracyEnabled) {
    if (!inaccuracyPoint) return items;

    const circles: OverlayCircle[] = attackers
      .map((attacker) => {
        const radiusMeters =
          computeInaccuracyRadius(attacker as BaseUnit, inaccuracyPoint) *
          radiusModifier *
          inaccuracyRadiusMultiplier;
        return {
          type: "circle",
          center: inaccuracyPoint,
          radius: radiusMeters / metersPerPixel,
          strokeColor: "black",
          strokeWidth: 1,
        } satisfies OverlayCircle;
      })
      .sort((a, b) => b.radius - a.radius);

    const [largestCircle, ...otherCircles] = circles;
    if (largestCircle) {
      items.push({
        ...largestCircle,
        color: "rgba(168,85,247,0.45)",
        fill: true,
      } satisfies OverlayCircle);
    }

    for (const circle of otherCircles) {
      items.push({
        ...circle,
        color: "rgba(0,0,0,0)",
        fill: false,
      } satisfies OverlayCircle);
    }

    for (const attacker of attackers) {
      items.push({
        type: "line",
        from: attacker.pos,
        to: inaccuracyPoint,
        color: "#facc15",
        width: 1,
        dash: [6, 6],
        dashOffset: -1,
      } satisfies OverlayLine);
    }

    return items;
  }

  for (const attacker of attackers) {
    for (const target of targets) {
      items.push({
        type: "line",
        from: attacker.pos,
        to: target.pos,
        color: "#facc15",
        width: 1,
        dash: [6, 6],
        dashOffset: -1,
      } satisfies OverlayLine);
    }
  }

  return items;
}
