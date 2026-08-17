export const UnitTriggerTypes = {
  AtGameTime: 'at_game_time',
  Periodic: 'periodic',
  OnEnemy: 'on_enemy',
  OnAttacked: 'on_attacked',
} as const

export type UnitTriggerType = (typeof UnitTriggerTypes)[keyof typeof UnitTriggerTypes]
