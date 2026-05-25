import { WaitCommand } from "@/engine/units/commands/waitCommand";
import { getWaitDurationSeconds } from "./waitTiming";
import type { WaitOrderUnit, WaitTimeInput } from "./types";

interface ApplyWaitOrderOptions<TUnit extends WaitOrderUnit> {
  units: TUnit[];
  time: WaitTimeInput;
  comment?: string;
}

export function applyWaitOrder<TUnit extends WaitOrderUnit>(options: ApplyWaitOrderOptions<TUnit>): void {
  const { units, time, comment } = options;
  const wait = getWaitDurationSeconds(time);
  const nextComment = comment?.trim();

  for (const unit of units) {
    const command = new WaitCommand({
      wait: wait > 0 ? wait : 0,
      elapsed: 0,
      comment: nextComment ? nextComment : undefined,
    });
    unit.addCommand(command.getState());
    unit.setDirty();
  }
}
