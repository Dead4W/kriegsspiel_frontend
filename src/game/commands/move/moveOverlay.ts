import type { vec2 } from "@/engine/types";
import type { OverlayItem } from "@/engine/types/overlayTypes";
import { BaseUnit } from "@/engine/units/baseUnit";
import { MoveCommand, type MoveCommandState } from "@/engine/units/commands/moveCommand";
import { getTeamColor, unitlayer } from "@/engine/2d/render";
import { unitType } from "@/engine";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes";
import {
  getColumnPosition,
  mergeColumnFirstSegmentWithSmartPath,
  type ColumnPlanItem as ColumnAlgoPlanItem,
} from "@/engine/units/formationMoveAlgorithms/columnAlgorithms";
import {
  getFormationReferenceAngle,
  getFormationSegmentAngles,
  getFormationTargetPoint,
} from "@/engine/units/formationMoveAlgorithms/formationAlgorithms";
import type { MoveMode, MovePlanItem, MoveRoutePoint } from "./types";

function shouldRenderMoveLine(
  segIndex: number | undefined,
  orderIndex: number | undefined,
  lastOrderIndex?: number
): boolean {
  const normalizedOrderIndex = orderIndex ?? 0;
  const isLastOrder = lastOrderIndex != null && normalizedOrderIndex === lastOrderIndex;
  return (segIndex ?? 0) === 0 || normalizedOrderIndex === 0 || isLastOrder;
}

function getFacingAngleFromSegment(from: vec2, to: vec2, fallback: number): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return fallback;

  const tau = Math.PI * 2;
  const angle = Math.atan2(dy, dx) + Math.PI / 2;
  return ((angle % tau) + tau) % tau;
}

function isSegmentLongEnoughMeters(from: vec2, to: vec2, metersPerPixel: number, minMeters = 30): boolean {
  const distMeters = Math.hypot(to.x - from.x, to.y - from.y) * metersPerPixel;
  return distMeters >= minMeters;
}

interface BuildMoveOverlayItemsOptions {
  movingUnits: BaseUnit[];
  targets: MoveRoutePoint[];
  plan: MovePlanItem[];
  formationCenter: vec2 | null;
  formationOffsets: Record<string, vec2>;
  moveMode: MoveMode;
  metersPerPixel: number;
  roomWorld: unknown;
  smartPathEnabled: boolean;
  hasObjectMap: boolean;
  renderExistingMoveCommands?: boolean;
}

export function buildMoveOverlayItems(options: BuildMoveOverlayItemsOptions): OverlayItem[] {
  const {
    movingUnits,
    targets,
    plan,
    formationCenter,
    formationOffsets,
    moveMode,
    metersPerPixel,
    roomWorld,
    smartPathEnabled,
    hasObjectMap,
    renderExistingMoveCommands = true,
  } = options;
  if (!movingUnits.length || !targets.length) return [];

  const items: OverlayItem[] = [];
  const routePoints = targets.map((item) => item.pos);
  const columnAlgoPlan: ColumnAlgoPlanItem[] = plan.map((item) => ({
    unitId: item.unit.id,
    startPos: item.startPos,
    orderIndex: item.orderIndex,
  }));
  const formationSegmentAngles = getFormationSegmentAngles(formationCenter, routePoints, metersPerPixel, 8);
  const formationRefAngle = getFormationReferenceAngle(formationSegmentAngles);

  for (const { unit, orderIndex } of plan) {
    const lastPlanOrderIndex = plan.length - 1;
    let from = unit.pos;
    let lastMoveSegment: { from: vec2; to: vec2 } | null = null;

    if (renderExistingMoveCommands) {
      for (const command of unit.getCommands()) {
        if (command.type !== UnitCommandTypes.Move) continue;
        const moveCommand = command as MoveCommand;
        const moveState = moveCommand.getState().state as MoveCommandState;
        const target = moveState.target;

        if (shouldRenderMoveLine(moveState.segIndex, moveState.orderIndex, lastPlanOrderIndex)) {
          items.push({
            type: "line",
            from,
            to: target,
            color: "rgba(34,197,94,0.65)",
            width: 6,
            dash: [6, 6],
            dashOffset: -1,
          });
        }
        lastMoveSegment = { from, to: target };
        from = target;
      }
    }

    for (let segIndex = 0; segIndex < targets.length; segIndex++) {
      const target = targets[segIndex]!;
      let segmentTargets: vec2[] = [];

      if (moveMode === "formation" && formationOffsets[unit.id]) {
        segmentTargets = [
          getFormationTargetPoint(
            segIndex,
            target.pos,
            formationOffsets[unit.id]!,
            formationSegmentAngles,
            formationRefAngle
          ),
        ];
      } else if (moveMode === "column") {
        segmentTargets = getColumnPosition(
          segIndex,
          orderIndex,
          routePoints,
          columnAlgoPlan,
          BaseUnit.COLLISION_RANGE
        );
        if (segIndex === 0) {
          segmentTargets = mergeColumnFirstSegmentWithSmartPath(
            roomWorld as any,
            from,
            segmentTargets,
            smartPathEnabled,
            hasObjectMap
          );
        }
      } else {
        segmentTargets = [target.pos];
      }

      for (const to of segmentTargets) {
        const isLongEnough = isSegmentLongEnoughMeters(from, to, metersPerPixel);
        if (shouldRenderMoveLine(segIndex, orderIndex, lastPlanOrderIndex)) {
          items.push({
            type: "line",
            from,
            to,
            color: "rgba(34,197,94,0.65)",
            width: 6,
            dash: [6, 6],
            dashOffset: -1,
          });
        }
        if (isLongEnough) {
          lastMoveSegment = { from, to };
        }
        from = to;
      }

      if (segIndex === targets.length - 1) {
        const to = segmentTargets.length ? segmentTargets[segmentTargets.length - 1]! : unit.pos;
        const previewAngle = lastMoveSegment
          ? getFacingAngleFromSegment(lastMoveSegment.from, lastMoveSegment.to, unit.angle)
          : unit.angle;
        const { r, g, b } = getTeamColor(unit.team);

        if (unit.type === unitType.MESSENGER) {
          items.push({
            type: "circle",
            center: { x: to.x, y: to.y },
            radius: Math.min(unitlayer.BASE_UNIT_W, unitlayer.BASE_UNIT_H) / 1.5,
            color: `rgba(${r},${g},${b},0.25)`,
            strokeColor: "black",
          });
        } else {
          items.push({
            type: "rect",
            from: { x: to.x - unitlayer.BASE_UNIT_W / 2, y: to.y - unitlayer.BASE_UNIT_H / 2 },
            to: { x: to.x + unitlayer.BASE_UNIT_W / 2, y: to.y + unitlayer.BASE_UNIT_H / 2 },
            angle: previewAngle,
            fillColor: `rgba(${r},${g},${b},0.25)`,
            color: "black",
          });
        }
      }

      if (segmentTargets.length) {
        from = segmentTargets[segmentTargets.length - 1]!;
      }
    }
  }

  return items;
}
