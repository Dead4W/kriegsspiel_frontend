import type { vec2 } from "@/engine/types";
import type { UnitAbilityType } from "@/engine/units/modifiers/UnitAbilityModifiers";

export interface AttackInaccuracyPoint {
  pos: vec2;
}

interface AttackSelectableUnit {
  team: string | number;
  selected: boolean;
  abilities: UnitAbilityType[];
  alive: boolean;
  isRetreat: boolean;
  attackRange: number;
  pos: vec2;
}

export interface AttackSelectionSnapshot<T> {
  attackers: T[];
  targets: T[];
}

interface BuildAttackSelectionSnapshotOptions<T extends AttackSelectableUnit> {
  allUnits: T[];
  attackerTeam: T["team"] | undefined;
  inaccuracyEnabled: boolean;
  inaccuracyAbility: UnitAbilityType | undefined;
}

export function buildAttackSelectionSnapshot<T extends AttackSelectableUnit>(
  options: BuildAttackSelectionSnapshotOptions<T>
): AttackSelectionSnapshot<T> {
  const { allUnits, attackerTeam, inaccuracyEnabled, inaccuracyAbility } = options;

  let attackers = allUnits.filter((unit) => unit.selected && unit.team === attackerTeam);
  let targets = allUnits.filter((unit) => unit.selected && unit.team !== attackerTeam);

  if (inaccuracyEnabled) {
    targets = [];
    if (inaccuracyAbility) {
      attackers = attackers.filter((unit) => unit.abilities.includes(inaccuracyAbility));
    }
  }

  return { attackers, targets };
}

export function isTargetInRangeOfAnyAttacker<T extends AttackSelectableUnit>(
  target: T,
  attackers: T[]
): boolean {
  for (const attacker of attackers) {
    if (!attacker.alive || attacker.isRetreat) continue;
    const dx = target.pos.x - attacker.pos.x;
    const dy = target.pos.y - attacker.pos.y;
    if (dx * dx + dy * dy <= attacker.attackRange * attacker.attackRange) {
      return true;
    }
  }
  return false;
}

export function getUnitPickRadiusPx(sizeUnitScale: number): number {
  return 15 * sizeUnitScale;
}

export function toAttackPoint(pos: vec2): AttackInaccuracyPoint {
  return { pos };
}
