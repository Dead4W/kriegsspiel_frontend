import type { FormationType } from "@/engine";

interface ChangeFormationUnit {
  setFormation(formation: FormationType): void;
}

interface ApplyChangeFormationOrderOptions<TUnit extends ChangeFormationUnit> {
  units: TUnit[];
  formation: FormationType;
}

export function applyChangeFormationOrder<TUnit extends ChangeFormationUnit>(
  options: ApplyChangeFormationOrderOptions<TUnit>
): void {
  const { units, formation } = options;

  for (const unit of units) {
    unit.setFormation(formation);
  }
}
