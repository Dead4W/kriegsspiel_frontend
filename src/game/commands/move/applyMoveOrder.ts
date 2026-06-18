import type { vec2 } from "@/engine/types";
import type { commandstate, uuid } from "@/engine";
import { MoveCommand } from "@/engine/units/commands/moveCommand";
import type { BaseCommand } from "@/engine/units/commands/baseCommand";
import { BaseUnit } from "@/engine/units/baseUnit";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes";
import type { UnitAbilityType } from "@/engine/units/modifiers/UnitAbilityModifiers";
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
import {
  canPlayerUseDirectViewOrder,
  getUnitsEligibleForDirectViewOrder,
  isPlayerDirectViewOrderContext
} from "@/engine/units/directViewOrderRules";
import type { MoveMode, MovePlanItem, MoveRoutePoint } from "./types";
import { isPointInsideActiveZone } from "@/game/planningSpawns";

interface ApplyMoveOrderOptions {
  movingUnits: BaseUnit[];
  routeTargets: MoveRoutePoint[];
  plan: MovePlanItem[];
  formationCenter: vec2 | null;
  formationOffsets: Record<string, vec2>;
  moveMode: MoveMode;
  smartPathEnabled: boolean;
  hasObjectMap: boolean;
  selectedAbilities: UnitAbilityType[];
  isPatrol: boolean;
  createUniqueId: () => string;
  roomWorld: unknown;
  emitDirectViewOrder: (payload: {
    team: unknown;
    unitId: uuid;
    commands: commandstate[];
  }) => void;
  playerTeam: unknown;
  metersPerPixel: number;
}

export function applyMoveOrder(options: ApplyMoveOrderOptions): void {
  const {
    movingUnits,
    routeTargets,
    plan,
    formationCenter,
    formationOffsets,
    moveMode,
    smartPathEnabled,
    hasObjectMap,
    selectedAbilities,
    isPatrol,
    createUniqueId,
    emitDirectViewOrder,
    playerTeam,
    metersPerPixel,
    roomWorld,
  } = options;
  if (!movingUnits.length || !routeTargets.length) return;
  if (routeTargets.some((target) => !isPointInsideActiveZone(target.pos))) return;

  const directViewEligibleUnits = getUnitsEligibleForDirectViewOrder(movingUnits) as BaseUnit[];
  const unitsToApplyOrder = isPlayerDirectViewOrderContext()
    ? directViewEligibleUnits
    : movingUnits;
  if (!unitsToApplyOrder.length) return;

  const uniqueId = createUniqueId();
  const shouldSendDirectViewOrder = canPlayerUseDirectViewOrder(unitsToApplyOrder);
  const shouldReplaceMoveCommands = shouldSendDirectViewOrder;
  const routePoints = routeTargets.map((item) => item.pos);
  const planByUnitId = new Map(plan.map((item) => [item.unit.id, item]));
  const normalizedPlan = unitsToApplyOrder
    .map((unit, orderIndex) => {
      const sourcePlan = planByUnitId.get(unit.id);
      if (!sourcePlan) return null;
      return {
        ...sourcePlan,
        orderIndex,
      };
    })
    .filter((item): item is MovePlanItem => item !== null);
  const columnAlgoPlan: ColumnAlgoPlanItem[] = normalizedPlan.map((item) => ({
    unitId: item.unit.id,
    startPos: item.startPos,
    orderIndex: item.orderIndex,
  }));
  const formationSegmentAngles = getFormationSegmentAngles(formationCenter, routePoints, metersPerPixel, 8);
  const formationRefAngle = getFormationReferenceAngle(formationSegmentAngles);
  const newCommands = new Map<uuid, BaseCommand<any, any>[]>();

  for (const { unit, orderIndex } of normalizedPlan) {
    let from = unit.pos;
    newCommands.set(unit.id, []);

    if (!shouldReplaceMoveCommands) {
      for (const command of unit.getCommands()) {
        if (command.type !== UnitCommandTypes.Move) continue;
        const moveCommand = command as MoveCommand;
        from = moveCommand.getState().state.target;
      }
    }

    for (let segIndex = 0; segIndex < routeTargets.length; segIndex++) {
      const target = routeTargets[segIndex]!;
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
        const command = new MoveCommand({
          target: { x: to.x, y: to.y },
          modifier: target.modifier ?? null,
          orderIndex: moveMode === "column" ? orderIndex : 0,
          uniqueId,
          abilities: selectedAbilities,
          segIndex,
          isPatrol,
        });
        newCommands.get(unit.id)!.push(command);
        from = to;
      }
      if (segmentTargets.length) {
        from = segmentTargets[segmentTargets.length - 1]!;
      }
    }
  }

  for (const unit of unitsToApplyOrder) {
    const commands = newCommands.get(unit.id)!;
    unit.manualEnvironment = null;
    if (shouldReplaceMoveCommands) {
      const nonMoveCommands = unit
        .getCommands()
        .filter((command) => command.type !== UnitCommandTypes.Move);
      unit.setCommands([...nonMoveCommands, ...commands]);
    } else {
      for (const command of commands) {
        unit.addCommand(command.getState());
      }
    }
    unit.setDirty();
  }

  if (!shouldSendDirectViewOrder) return;
  for (const selectedUnit of unitsToApplyOrder) {
    const moveCommands = (newCommands.get(selectedUnit.id) ?? [])
      .map((command) => command.getState() as commandstate)
      .filter((command) => command.type === UnitCommandTypes.Move);
    emitDirectViewOrder({
      team: playerTeam,
      unitId: selectedUnit.id,
      commands: moveCommands,
    });
  }
}
