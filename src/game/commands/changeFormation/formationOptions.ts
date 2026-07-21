import type { FormationType } from "@/engine";
import { getFormationTypes } from "@/engine/resourcePack/formations";
import { getUnitFormationTypes } from "@/engine/resourcePack/units";

interface FormationSelectableUnit {
  type: string
}

export function getAvailableFormationTypes(
  units: FormationSelectableUnit[] = []
): FormationType[] {
  const formations = getFormationTypes();
  if (!units.length) return formations;

  const availableByUnit = units.map((unit) => new Set(getUnitFormationTypes(unit.type)));
  return formations.filter((formation) =>
    availableByUnit.every((available) => available.has(formation))
  );
}
