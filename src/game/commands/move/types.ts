import type { vec2 } from "@/engine/types";
import type { EnvironmentStateId } from "@/engine/resourcePack/environment";
import type { BaseUnit } from "@/engine/units/baseUnit";

export type MoveMode = "column" | "formation";

export interface MoveRoutePoint {
  pos: vec2;
  modifier?: EnvironmentStateId | null;
}

export interface MovePlanItem {
  unit: BaseUnit;
  orderIndex: number;
  startPos: vec2;
}
