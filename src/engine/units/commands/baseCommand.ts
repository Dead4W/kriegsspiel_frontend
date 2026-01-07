// units/commands/baseCommand.ts
import type { BaseUnit } from "@/engine/units/baseUnit.ts";

export enum CommandStatus {
  Pending = 'pending',
  Running = 'running',
}

export abstract class BaseCommand<
  TType,
  TState
> {
  status: CommandStatus = CommandStatus.Pending

  abstract readonly type: TType

  /** вызывается один раз */
  start(unit: BaseUnit): void {
    this.status = CommandStatus.Running
    unit.setDirty();
  }

  /** вызывается каждый тик */
  abstract update(unit: BaseUnit, dt: number): void

  /** можно ли считать приказ выполненным */
  abstract isFinished(unit: BaseUnit): boolean

  abstract getState(): { type: TType; state: TState }
}
