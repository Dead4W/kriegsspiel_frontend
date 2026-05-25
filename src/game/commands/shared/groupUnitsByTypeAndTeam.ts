import type { unitTeam } from "@/engine";

export interface UnitGroup {
  type: string;
  team: unitTeam;
  count: number;
}

interface GroupableUnit {
  type: string;
  team: unitTeam;
}

export function groupUnitsByTypeAndTeam<T extends GroupableUnit>(units: T[]): UnitGroup[] {
  const map = new Map<string, UnitGroup>();

  for (const unit of units) {
    const key = `${unit.type}:${unit.team}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }

    map.set(key, {
      type: unit.type,
      team: unit.team,
      count: 1,
    });
  }

  return [...map.values()];
}
