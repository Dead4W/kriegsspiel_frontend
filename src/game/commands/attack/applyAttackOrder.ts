import type { vec2 } from "@/engine/types";
import { AttackCommand } from "@/engine/units/commands/attackCommand";
import type { UnitAbilityType } from "@/engine/units/modifiers/UnitAbilityModifiers";

interface AttackOrderAttacker {
  addCommand(state: unknown): void;
  setDirty(): void;
}

interface AttackOrderTarget {
  id: string;
}

interface ApplyAttackOrderOptions<TAttacker extends AttackOrderAttacker, TTarget extends AttackOrderTarget> {
  attackers: TAttacker[];
  targets: TTarget[];
  damageModifier: number;
  radiusModifier: number;
  abilities: UnitAbilityType[];
  inaccuracyPoint: vec2 | null;
}

export function applyAttackOrder<TAttacker extends AttackOrderAttacker, TTarget extends AttackOrderTarget>(
  options: ApplyAttackOrderOptions<TAttacker, TTarget>
): void {
  const {
    attackers,
    targets,
    damageModifier,
    radiusModifier,
    abilities,
    inaccuracyPoint,
  } = options;

  for (const unit of attackers) {
    const command = new AttackCommand({
      targets: targets.map((target) => target.id),
      damageModifier,
      radiusModifier,
      abilities,
      inaccuracyPoint,
    });
    unit.addCommand(command.getState());
    unit.setDirty();
  }
}
