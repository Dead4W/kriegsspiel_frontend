import type { world } from "@/engine/world/world.ts";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes.ts";
import { applyAutoEnvironment } from "@/engine/units/autoEnvironment.ts";
import { AttackCommand, type AttackCommandState } from "@/engine/units/commands/attackCommand.ts";
import { type MoveCommandState } from "@/engine/units/commands/moveCommand.ts";
import type { vec2 } from "@/engine/types.ts";
import { BaseUnit } from "@/engine/units/baseUnit.ts";

const MAX_STEP_SECONDS = 60;

type UnitLike = ReturnType<world["units"]["list"]>[number];

function setUnitAngleFromMoveVector(unit: { angle: number }, from: vec2, to: vec2) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return;

  const tau = Math.PI * 2;
  const angle = Math.atan2(dy, dx) + Math.PI / 2;
  unit.angle = ((angle % tau) + tau) % tau;
}

type UnitMoveSortKey = {
  uniqueId: string;
  orderIndex: number;
};

function getFirstMoveSortKey(unit: UnitLike): UnitMoveSortKey | null {
  const firstMoveCommand = unit
    .getCommands()
    .find((cmd) => cmd.type === UnitCommandTypes.Move && !cmd.isFinished(unit));
  if (!firstMoveCommand) return null;

  const moveState = firstMoveCommand.getState().state as MoveCommandState;
  return {
    uniqueId: moveState.uniqueId ?? "",
    orderIndex: Number.isFinite(moveState.orderIndex)
      ? moveState.orderIndex
      : Number.MAX_SAFE_INTEGER,
  };
}

function sortUnitsForTurnStep(units: UnitLike[]) {
  units.sort((a, b) => {
    const aMove = getFirstMoveSortKey(a);
    const bMove = getFirstMoveSortKey(b);

    if (aMove && !bMove) return -1;
    if (!aMove && bMove) return 1;

    if (aMove && bMove) {
      if (aMove.uniqueId !== bMove.uniqueId) {
        return aMove.uniqueId.localeCompare(bMove.uniqueId);
      }
      if (aMove.orderIndex !== bMove.orderIndex) {
        return aMove.orderIndex - bMove.orderIndex;
      }
    }

    return a.id.localeCompare(b.id);
  });
}

function syncFormationMoveSpeedByOrder(units: UnitLike[], worldInstance: world) {
  type GroupUnit = {
    unit: UnitLike;
    moveState: MoveCommandState;
  };

  const moveGroups = new Map<string, GroupUnit[]>();
  const getWaitingColumnSpeedMultiplier = (distancePx: number, worldInstance: world): number => {
    if (distancePx <= BaseUnit.COLLISION_RANGE) return 1;
    const metersPerPixel = Math.max(0.0001, Number(worldInstance.map.metersPerPixel) || 1);
    const distanceMeters = distancePx * metersPerPixel;
    const collisionRangeMeters = BaseUnit.COLLISION_RANGE * metersPerPixel;
    const multiplier = 1 - (distanceMeters - collisionRangeMeters) * 0.001;
    return Math.max(0.1, Math.min(1, multiplier));
  };

  for (const unit of units) {
    if (!unit.alive) continue;
    unit.setFormationMoveMinSpeed(null);
    unit.setColumnLagSpeedMultiplier(1);

    const firstActiveCommand = unit.getCommands().find((cmd) => !cmd.isFinished(unit));
    if (!firstActiveCommand || firstActiveCommand.type !== UnitCommandTypes.Move) continue;

    const moveState = firstActiveCommand.getState().state as MoveCommandState;
    if (!moveState.uniqueId) continue;

    const groupUnits = moveGroups.get(moveState.uniqueId);
    if (groupUnits) {
      groupUnits.push({
        unit,
        moveState,
      });
    } else {
      moveGroups.set(moveState.uniqueId, [
        {
          unit,
          moveState,
        },
      ]);
    }
  }

  for (const groupUnits of moveGroups.values()) {
    if (groupUnits.length < 2) continue;

    const minSpeed = Math.min(...groupUnits.map(({ unit }) => unit.speed));
    const unitByOrderIndex = new Map<number, GroupUnit>();

    for (const groupUnit of groupUnits) {
      const orderIndex = Number.isFinite(groupUnit.moveState.orderIndex)
        ? groupUnit.moveState.orderIndex
        : Number.MAX_SAFE_INTEGER;
      if (!unitByOrderIndex.has(orderIndex)) {
        unitByOrderIndex.set(orderIndex, groupUnit);
      }
    }

    for (const groupUnit of groupUnits) {
      let laggingMultiplier = 1;
      const currentOrderIndex = Number.isFinite(groupUnit.moveState.orderIndex)
        ? groupUnit.moveState.orderIndex
        : Number.MAX_SAFE_INTEGER;

      const prevUnit = unitByOrderIndex.get(currentOrderIndex - 1);
      if (prevUnit) {
        const distanceToPrevPx = Math.hypot(
          prevUnit.unit.pos.x - groupUnit.unit.pos.x,
          prevUnit.unit.pos.y - groupUnit.unit.pos.y,
        );
        if (distanceToPrevPx > BaseUnit.COLLISION_RANGE) {
          laggingMultiplier = 1.1;
        }
      }

      const nextUnit = unitByOrderIndex.get(currentOrderIndex + 1);
      if (nextUnit && laggingMultiplier === 1) {
        const distancePx = Math.hypot(
          nextUnit.unit.pos.x - groupUnit.unit.pos.x,
          nextUnit.unit.pos.y - groupUnit.unit.pos.y,
        );
        laggingMultiplier = getWaitingColumnSpeedMultiplier(distancePx, worldInstance);
      }

      groupUnit.unit.setFormationMoveMinSpeed(minSpeed);
      groupUnit.unit.setColumnLagSpeedMultiplier(laggingMultiplier);
    }
  }
}

export function processUnitCommands(worldInstance: world, dt: number) {
  const units = worldInstance.units.list();
  sortUnitsForTurnStep(units);

  for (const unit of units) {
    if (!unit.alive) continue;
    const commands = unit.getCommands();
    const firstActiveCommand = commands.find((cmd) => !cmd.isFinished(unit));
    const isMovingNow = firstActiveCommand?.type === UnitCommandTypes.Move;
    applyAutoEnvironment(unit, isMovingNow ? "moving" : "standing");
  }
  syncFormationMoveSpeedByOrder(units, worldInstance);

  for (const unit of units) {
    if (!unit.alive) continue;
    let commands = unit.getCommands();

    if (unit.autoAttack) {
      const directEnemyVision = worldInstance.units
        .getDirectView(unit)
        .filter((u) => u.team !== unit.team);
      const hasInaccuracyAttack =
        commands.filter(
          (c) =>
            c.type === UnitCommandTypes.Attack &&
            (c.getState().state as AttackCommandState).inaccuracyPoint,
        ).length > 0;

      if (!hasInaccuracyAttack) {
        commands = commands.filter((c) => c.type !== UnitCommandTypes.Attack);
        const attackCommand = new AttackCommand({
          targets: directEnemyVision.map((u) => u.id),
          damageModifier: 1,
          abilities: [],
          inaccuracyPoint: null,
        });
        commands.push(attackCommand);
      }
    }

    if (commands.length === 0) continue;

    let leftDt = dt;
    const goodCommands = [];
    const postGoodCommands = [];

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]!;
      const moveStartPos =
        cmd.type === UnitCommandTypes.Move ? { x: unit.pos.x, y: unit.pos.y } : null;

      let isRepeat = false;
      if (cmd.type === UnitCommandTypes.Move) {
        const cmdMoveState = cmd.getState().state as MoveCommandState;
        isRepeat = cmdMoveState.isPatrol ?? false;
      }

      if (cmd.isFinished(unit)) {
        if (isRepeat) postGoodCommands.push(cmd);
        continue;
      }

      if ([UnitCommandTypes.Attack, UnitCommandTypes.Retreat, UnitCommandTypes.Delivery].includes(cmd.type)) {
        cmd.start(unit);
        cmd.update(unit, dt);
        if (cmd.type === UnitCommandTypes.Delivery) {
          commands = unit.getCommands();
        }
      } else {
        if (leftDt > 0) {
          const estimate = cmd.estimate(unit);
          cmd.start(unit);
          if (estimate > leftDt) {
            cmd.update(unit, leftDt);
            leftDt = 0;
          } else {
            cmd.update(unit, estimate);
            leftDt -= estimate;
          }
        } else {
          goodCommands.push(cmd);
          continue;
        }
      }

      const isFinishedAfterUpdate = cmd.isFinished(unit);
      if (isFinishedAfterUpdate && cmd.type === UnitCommandTypes.Move && moveStartPos) {
        const moveState = cmd.getState().state as MoveCommandState;
        setUnitAngleFromMoveVector(unit, moveStartPos, moveState.target);
      }

      if (!isFinishedAfterUpdate) {
        goodCommands.push(cmd);
      } else if (isRepeat) {
        postGoodCommands.push(cmd);
      }
    }

    for (const cmd of postGoodCommands) {
      goodCommands.push(cmd);
    }

    unit.setCommands(goodCommands);
    const nextActiveCommand = goodCommands.find((cmd) => !cmd.isFinished(unit));
    const isMovingAfterStep = nextActiveCommand?.type === UnitCommandTypes.Move;
    applyAutoEnvironment(unit, isMovingAfterStep ? "moving" : "standing");
    unit.setDirty();
  }

  syncFormationMoveSpeedByOrder(units, worldInstance);
}

export async function runTurnStep(params: {
  worldInstance: world;
  secondsToSkip: number;
  isLive: boolean;
  liveGameSecondsPerMinute?: number;
  shouldContinue?: () => boolean;
}) {
  const { worldInstance, secondsToSkip, isLive, liveGameSecondsPerMinute, shouldContinue } = params;
  if (secondsToSkip <= 0) return 0;

  worldInstance.units.withNewCommandsTmp.clear();
  worldInstance.socketLock = true;
  let runningSteps = 0;

  try {
    let leftSeconds = secondsToSkip;
    while (leftSeconds > 0 && (shouldContinue?.() ?? true)) {
      const step = Math.min(MAX_STEP_SECONDS, leftSeconds);
      processUnitCommands(worldInstance, step);
      leftSeconds -= step;
      runningSteps++;

      worldInstance.events.emit("changed", { reason: "unit" });
      worldInstance.skipTime(step, false);
      await new Promise(requestAnimationFrame);
    }

    const dirtyUnits = worldInstance.units.getDirty();
    for (const dirty of dirtyUnits) {
      worldInstance.events.emit("api", {
        type: "unit",
        data: dirty.unit,
        frames: dirty.frames.length ? dirty.frames : undefined,
      });
    }

    const removedUnits = worldInstance.units.getDirtyRemove();
    if (removedUnits.length) {
      worldInstance.events.emit("api", {
        type: "unit-remove",
        data: removedUnits,
      });
    }

    if (runningSteps > 0) {
      worldInstance.events.emit("api", {
        type: "skip_time",
        data: worldInstance.time,
        live: isLive || undefined,
        liveIntervalMs: isLive ? Number(process.env.LIVE_INTERVAL_MS || 30000) : undefined,
        liveGameSecondsPerMinute: isLive ? liveGameSecondsPerMinute : undefined,
      });
    }

    for (const unitId of worldInstance.units.withNewCommandsTmp) {
      worldInstance.units.withNewCommands.add(unitId);
    }

    worldInstance.skipTime(0, false);
    worldInstance.socketLock = false;
    await worldInstance.events.emit("force_api", {});
    await worldInstance.events.emit("changed", { reason: "timer" });
  } finally {
    worldInstance.units.withNewCommandsTmp.clear();
  }

  return runningSteps;
}
