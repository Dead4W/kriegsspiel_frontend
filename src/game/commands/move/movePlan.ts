import type { vec2 } from "@/engine/types";
import type { uuid } from "@/engine";
import { BaseUnit } from "@/engine/units/baseUnit";
import { MoveCommand, type MoveCommandState } from "@/engine/units/commands/moveCommand";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes";
import { buildColumnPlanByFirstTargetDistance } from "@/engine/units/formationMoveAlgorithms/columnAlgorithms";
import {
  buildFormationCenter,
  buildFormationOffsets,
} from "@/engine/units/formationMoveAlgorithms/formationAlgorithms";
import type { MovePlanItem } from "./types";

type MovePlanOptions = {
  ignoreExistingMoveCommands?: boolean;
};

export function getUnitPlannedPos(unit: BaseUnit, options?: MovePlanOptions): vec2 {
  if (options?.ignoreExistingMoveCommands) {
    return { x: unit.pos.x, y: unit.pos.y };
  }
  let pos: vec2 = unit.pos;
  for (const command of unit.getCommands()) {
    if (command.type !== UnitCommandTypes.Move) continue;
    const moveCommand = command as MoveCommand;
    pos = moveCommand.getState().state.target;
  }
  return pos;
}

function getFirstActiveMoveState(unit: BaseUnit): MoveCommandState | null {
  const activeMove = unit.getCommands().find(
    (command) => command.type === UnitCommandTypes.Move && !command.isFinished(unit)
  );
  if (!activeMove) return null;
  return (activeMove as MoveCommand).getState().state;
}

function resolveOrderByExistingColumn(units: BaseUnit[]): uuid[] | null {
  const groupedByMove = new Map<string, Array<{ unitId: uuid; orderIndex: number }>>();
  for (const unit of units) {
    const moveState = getFirstActiveMoveState(unit);
    if (!moveState || !moveState.uniqueId || !Number.isFinite(moveState.orderIndex)) continue;
    const item = { unitId: unit.id, orderIndex: moveState.orderIndex };
    const existing = groupedByMove.get(moveState.uniqueId);
    if (existing) {
      existing.push(item);
    } else {
      groupedByMove.set(moveState.uniqueId, [item]);
    }
  }

  for (const group of groupedByMove.values()) {
    if (group.length !== units.length) continue;
    const uniqueOrder = new Set(group.map((item) => item.orderIndex));
    if (uniqueOrder.size !== group.length) continue;
    return group
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => item.unitId);
  }

  return null;
}

export function buildMovePlan(units: BaseUnit[], firstTarget: vec2, options?: MovePlanOptions): MovePlanItem[] {
  if (!units.length) return [];

  const unitsWithStartPos = units.map((unit) => ({
    unit,
    startPos: getUnitPlannedPos(unit, options),
  }));
  const orderByExistingColumn = options?.ignoreExistingMoveCommands
    ? null
    : resolveOrderByExistingColumn(units);

  if (orderByExistingColumn) {
    const startPosByUnitId = new Map(
      unitsWithStartPos.map(({ unit, startPos }) => [unit.id, startPos] as const)
    );
    return orderByExistingColumn
      .map((unitId) => {
        const unit = units.find((item) => item.id === unitId);
        const startPos = startPosByUnitId.get(unitId);
        if (!unit || !startPos) return null;
        return { unit, startPos };
      })
      .filter((item): item is { unit: BaseUnit; startPos: vec2 } => Boolean(item))
      .map(({ unit, startPos }, orderIndex) => ({ unit, startPos, orderIndex }));
  }

  const algoPlan = buildColumnPlanByFirstTargetDistance(
    unitsWithStartPos.map(({ unit, startPos }) => ({ unitId: unit.id, startPos })),
    firstTarget
  );
  const unitById = new Map(unitsWithStartPos.map((item) => [item.unit.id, item.unit] as const));

  return algoPlan
    .map((item) => {
      const unit = unitById.get(item.unitId);
      if (!unit) return null;
      return {
        unit,
        startPos: item.startPos,
        orderIndex: item.orderIndex,
      };
    })
    .filter((item): item is MovePlanItem => Boolean(item));
}

export function buildMoveFormationCenter(units: BaseUnit[], options?: MovePlanOptions): vec2 | null {
  return buildFormationCenter(
    units.map((unit) => ({
      unitId: unit.id,
      startPos: getUnitPlannedPos(unit, options),
    }))
  );
}

export function buildMoveFormationOffsets(
  units: BaseUnit[],
  center: vec2 | null,
  options?: MovePlanOptions
): Record<uuid, vec2> {
  return buildFormationOffsets(
    units.map((unit) => ({
      unitId: unit.id,
      startPos: getUnitPlannedPos(unit, options),
    })),
    center
  ) as Record<uuid, vec2>;
}
