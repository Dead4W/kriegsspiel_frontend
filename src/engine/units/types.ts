import type {vec2} from "@/engine/types.ts";
import {type UnitEnvironmentState} from "@/engine/units/enums/UnitStates.ts";
import type {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import type {AttackCommandState} from "@/engine/units/commands/attackCommand.ts";
import type {ChangeFormationCommandState} from "@/engine/units/commands/changeFormationCommand.ts";
import type {MoveCommandState} from "@/engine/units/commands/moveCommand.ts";
import type {WaitCommandState} from "@/engine/units/commands/waitCommand.ts";
import type {DeliveryCommandState} from "@/engine/units/commands/deliveryCommand.ts";
import {CommandStatus} from "@/engine/units/commands/baseCommand.ts";
import type {MessageLinked} from "@/engine/units/baseUnit.ts";
import type {UnitAbilityType} from "@/engine/units/abilities/baseAbility.ts";

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
  Springing = 'springing',
  KneelingVolley = 'kneelingVolley',
  ForceWalking = 'forceWalking',
  Column = 'column',
  OnHorse = 'onHorse',
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
  activeAbilityType?: UnitAbilityType | null;

  messagesLinked?: MessageLinked[],

  directView?: boolean

  activeAbility?: UnitAbilityType | null;
}

export type commandstate =
  { type: UnitCommandTypes.Move; status: CommandStatus; state: MoveCommandState }
  | { type: UnitCommandTypes.Attack; status: CommandStatus; state: AttackCommandState }
  | { type: UnitCommandTypes.ChangeFormation; status: CommandStatus; state: ChangeFormationCommandState }
  | { type: UnitCommandTypes.Wait; status: CommandStatus; state: WaitCommandState }
  | { type: UnitCommandTypes.Delivery; status: CommandStatus; state: DeliveryCommandState }
