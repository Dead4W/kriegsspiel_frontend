import type {vec2} from "@/engine/types.ts";
import type {UnitEnvironmentState} from "@/engine/units/enums/UnitStates.ts";
import type {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import type {AbilityAttackCommandState} from "@/engine/units/commands/abilityAttackCommand.ts";
import type {AttackCommandState} from "@/engine/units/commands/attackCommand.ts";
import type {ChangeFormationCommandState} from "@/engine/units/commands/changeFormationCommand.ts";
import type {MoveCommandState} from "@/engine/units/commands/moveCommand.ts";
import type {WaitCommandState} from "@/engine/units/commands/waitCommand.ts";
import type {DeliveryCommandState} from "@/engine/units/commands/deliveryCommand.ts";

export type uuid = string

export type unitTeam = 'red' | 'blue' | 'neutral'

export enum unitType {
  INFANTRY = 'infantry',
  CAVALRY = 'cavalry',
  ARTILLERY = 'artillery',
  MARINE = 'marine',
  MILITIA = 'militia',
  GATLING = 'gatling',
  GENERAL = 'general',
  MESSENGER = 'messenger',
}

export enum FormationType {
  Default = 'default',
  Line = 'line',
  Column = 'column',
  Wedge = 'wedge',
  Circle = 'circle',
}


export interface unitstate {
  id: uuid
  type: unitType
  team: unitTeam
  pos: vec2

  heading?: number
  label?: string

  hp?: number
  ammo?: number

  morale?: number

  commands?: commandstate[]

  envState?: UnitEnvironmentState[]

  formation?: FormationType;

  messageIds?: uuid[],
}

export type commandstate =
  { type: UnitCommandTypes.Move; state: MoveCommandState }
  | { type: UnitCommandTypes.Attack; state: AttackCommandState }
  | { type: UnitCommandTypes.AbilityAttack; state: AbilityAttackCommandState }
  | { type: UnitCommandTypes.ChangeFormation; state: ChangeFormationCommandState }
  | { type: UnitCommandTypes.Wait; state: WaitCommandState }
  | { type: UnitCommandTypes.Delivery; state: DeliveryCommandState }
