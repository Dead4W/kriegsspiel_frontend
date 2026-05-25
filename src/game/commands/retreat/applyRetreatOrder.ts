import { RetreatCommand } from "@/engine/units/commands/retreatCommand";
import { getRetreatDurationSeconds } from "./retreatTiming";
import type { RetreatOrderUnit, RetreatTimeInput } from "./types";

interface ApplyRetreatOrderOptions<TUnit extends RetreatOrderUnit> {
  units: TUnit[];
  time: RetreatTimeInput;
}

export function applyRetreatOrder<TUnit extends RetreatOrderUnit>(
  options: ApplyRetreatOrderOptions<TUnit>
): void {
  const { units, time } = options;
  const duration = getRetreatDurationSeconds(time);

  for (const unit of units) {
    const command = new RetreatCommand({
      elapsed: 0,
      duration: duration > 0 ? duration : 0,
    });
    unit.clearCommands();
    unit.setCommands([command]);
    unit.setDirty();
  }
}
