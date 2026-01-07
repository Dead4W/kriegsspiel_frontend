import { BaseCommand } from "@/engine/units/commands/baseCommand.ts";
import {
  AbilityAttackCommand,
  type AbilityAttackCommandState
} from "@/engine/units/commands/abilityAttackCommand.ts";
import {AttackCommand, type AttackCommandState} from "@/engine/units/commands/attackCommand.ts";
import {
  ChangeFormationCommand,
  type ChangeFormationCommandState
} from "@/engine/units/commands/changeFormationCommand.ts";
import {MoveCommand, type MoveCommandState} from "@/engine/units/commands/moveCommand.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import type {commandstate} from "@/engine";
import type {WaitCommandState} from "@/engine/units/commands/waitCommand.ts";
import {
  DeliveryCommand,
  type DeliveryCommandState
} from "@/engine/units/commands/deliveryCommand.ts";

export function initUnitCommand(state: commandstate) {
  switch (state.type) {
    case UnitCommandTypes.Attack:
      return new AttackCommand(state.state)
    case UnitCommandTypes.AbilityAttack:
      return new AbilityAttackCommand(state.state)
    case UnitCommandTypes.Move:
      return new MoveCommand(state.state)
    case UnitCommandTypes.ChangeFormation:
      return new ChangeFormationCommand(state.state)
    case UnitCommandTypes.Delivery:
      return new DeliveryCommand(state.state)
    default:
      // @ts-ignore
      throw new Error(`Unknown unit type: "${state.type}"`)
  }
}

export function createUnitCommand(state: commandstate): BaseCommand<UnitCommandTypes, AbilityAttackCommandState | AttackCommandState | ChangeFormationCommandState | MoveCommandState | WaitCommandState | DeliveryCommandState> {
  const cmd = initUnitCommand(state)
  cmd.status = state.status
  return cmd;
}

