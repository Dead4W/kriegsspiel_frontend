import {
  type commandstate,
  FormationType,
  type unitTeam,
  type unitstate,
  type unitType,
  type uuid
} from './types'
import type {MoveFrame, vec2} from "@/engine/types.ts";
import {UnitEnvironmentState} from "@/engine/units/enums/UnitStates.ts";
import {ENV_MULTIPLIERS} from '@/engine/units/enums/UnitEnvModifiers'
import {createRafInterval, interpolateMoveFrames, type RafInterval} from "@/engine/util.ts";
import {FORMATION_STAT_MULTIPLIERS} from "@/engine/units/enums/UnitFormationModifiers.ts";
import {createUnitCommand} from "@/engine/units/commands";
import type {BaseCommand} from "@/engine/units/commands/baseCommand.ts";
import {clamp} from "@/engine/math.ts";
import type {ChatMessage} from "@/engine/types/chatMessage.ts";
import {Team} from "@/enums/teamKeys.ts";

type StatKey = 'damage' | 'defense' | 'speed' | 'attackRange' | 'visionRange'

export interface StatModifierInfo {
  totalMultiplier: number
  percent: number
  sources: {
    state: UnitEnvironmentState
    multiplier: number
  }[]
}

export interface UnitStats {
  maxHp: number
  damage: number,
  speed: number
  defense: number
  attackRange: number
  visionRange: number
  ammoMax?: number
}

export abstract class BaseUnit {
  static readonly COLLISION_RANGE = 30;

  id: uuid
  abstract type: unitType

  team: unitTeam
  pos: vec2
  heading = 0
  label = ''

  selected = false
  previewSelected = false // временное (рамка)

  isDirty = false

  hp: number
  ammo?: number

  morale: number

  abstract stats: UnitStats
  abstract abilities: string[]

  envState: UnitEnvironmentState[] = []

  private dirtyMoveStartAt = 0;
  private lastDirtyMoveAt = 0

  private remoteMoveFrames: MoveFrame[] = []
  private remoteMoveFrameTimer: RafInterval | null = null
  private remoteMoveFrameStart = 0;

  private commands: commandstate[] = []

  private formation: FormationType;

  private messageIds: uuid[] = []

  lastSelected: number = 0;

  public directView: boolean = false;

  constructor(s: unitstate) {
    this.id = s.id
    this.team = s.team
    this.pos = s.pos;

    this.heading = s.heading ?? 0
    this.label = s.label ?? ''
    this.hp = 0;
    this.morale = s.morale ?? 0;
    this.commands = s.commands ?? [];

    this.formation = s.formation ?? FormationType.Line;

    this.envState = s.envState ?? [];
    this.messageIds = s.messageIds ?? [];
    this.directView = s.directView ?? false
    this.refreshEnvState();
  }

  move(to: vec2) {
    if (this.directView && window.PLAYER.team !== Team.ADMIN) {
      return;
    }

    to.x = clamp(to.x, 0, window.ROOM_WORLD.map.width);
    to.y = clamp(to.y, 0, window.ROOM_WORLD.map.height);

    this.pos = to;
    this.refreshEnvState();

    const now = performance.now()
    if (!this.isDirty) {
      this.dirtyMoveStartAt = now;
      window.ROOM_WORLD.units.addUnitDirty(this.id);
      this.isDirty = true;
    } else {
      if (now - this.lastDirtyMoveAt >= 50) {
        this.lastDirtyMoveAt = now;
        window.ROOM_WORLD.units.addDirtyMove(this.id, {
          t: now - this.dirtyMoveStartAt,
          pos: { ...to },
        } as MoveFrame)
      }
    }
  }

  public setDirty() {
    window.ROOM_WORLD.units.addUnitDirty(this.id);
  }

  public isSelected(): boolean {
    return this.selected || this.previewSelected;
  }

  /** вызывается ПОСЛЕ super() в наследнике */
  protected initStats(s: unitstate) {
    this.hp = clamp(s.hp ?? this.stats.maxHp, 0, this.stats.maxHp)

    if (this.stats.ammoMax !== undefined) {
      this.ammo = s.ammo ?? this.stats.ammoMax
    }
  }

  takeDamage(amount: number) {
    this.hp -= amount * this.defense;
    if (this.hp <= 0) {
      this.hp = 0
    }
    this.setDirty()
  }

  toState(): unitstate {
    return {
      id: this.id,
      type: this.type,
      team: this.team,
      pos: this.pos,

      heading: this.heading,
      label: this.label,

      hp: this.hp,
      ammo: this.ammo,

      morale: this.morale,

      commands: this.commands,

      envState: this.envState,

      formation: this.formation,

      messageIds: this.messageIds,

      directView: this.directView,
    }
  }

  refreshEnvState() {


    // const world = window.ROOM_WORLD
    // const forest = world.forestImageData
    //
    // // если лес ещё не готов
    // if (!forest) return
    //
    // const x = Math.floor(this.pos.x)
    // const y = Math.floor(this.pos.y)
    //
    // // вне карты
    // if (
    //   x < 0 || y < 0 ||
    //   x >= forest.width ||
    //   y >= forest.height
    // ) {
    //   return
    // }
    //
    // const i = (y * forest.width + x) * 4
    // const alpha = forest.data[i + 3]!
    //
    // if (alpha > 0 && this.envState.filter(s => s !== UnitEnvironmentState.InForest).length === 0) {
    //   if (!this.envState.includes(UnitEnvironmentState.InForest)) {
    //     this.envState.push(UnitEnvironmentState.InForest);
    //   }
    // } else {
    //   this.envState = this.envState.filter(
    //     state => state !== UnitEnvironmentState.InForest
    //   );
    // }
  }

  private getEnvMultiplier<K extends keyof UnitStats | 'damage'>(
    key: K
  ): number {
    let mul = 1

    for (const state of this.envState) {
      // @ts-ignore
      let m = ENV_MULTIPLIERS[state]?.[key];
      if (
        ENV_MULTIPLIERS[state]
        && ENV_MULTIPLIERS[state].byTypes
        && ENV_MULTIPLIERS[state].byTypes[this.type]
        && ENV_MULTIPLIERS[state].byTypes[this.type][key]
      ) {
        m = ENV_MULTIPLIERS[state]?.byTypes[this.type][key]
      }
      if (m !== undefined) mul *= m
    }

    mul *= this.getFormationMultiplier(key)

    return mul
  }

  private getFormationMultiplier<K extends keyof UnitStats | 'damage'>(
    key: K
  ): number {
    return FORMATION_STAT_MULTIPLIERS[this.formation]?.[key] ?? 1
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get defense(): number {
    return this.stats.defense * this.getEnvMultiplier('defense')
  }

  get damage(): number {
    return this.stats.damage * this.getEnvMultiplier('damage')
  }

  get attackRange(): number {
    return this.stats.attackRange * this.getEnvMultiplier('attackRange')
  }

  get visionRange(): number {
    return this.stats.visionRange * this.getEnvMultiplier('visionRange')
  }

  get speed(): number {
    return this.stats.speed * this.getEnvMultiplier('speed')
  }

  get height(): number {
    return window.ROOM_WORLD.heightMap?.getHeightAt(this.pos.x, this.pos.y) ?? 0;
  }

  public getStatModifierInfo(key: StatKey): StatModifierInfo {
    let total = 1
    const sources: StatModifierInfo['sources'] = []

    for (const state of this.envState) {
      let m = ENV_MULTIPLIERS[state]?.[key];
      if (
        ENV_MULTIPLIERS[state]
        && ENV_MULTIPLIERS[state].byTypes
        && ENV_MULTIPLIERS[state].byTypes[this.type]
        && ENV_MULTIPLIERS[state].byTypes[this.type][key]
      ) {
        m = ENV_MULTIPLIERS[state]?.byTypes[this.type][key]
      }
      if (m !== undefined) {
        total *= m
        sources.push({ state, multiplier: m })
      }
    }

    return {
      totalMultiplier: total,
      percent: Math.round((total - 1) * 100),
      sources,
    }
  }

  applyRemoteFrames(frames: MoveFrame[]) {
    this.remoteMoveFrames = interpolateMoveFrames(frames, 3);

    // если уже проигрывается — выходим
    if (this.remoteMoveFrameTimer) {
      this.remoteMoveFrameTimer.stop();
      this.remoteMoveFrameTimer = null;
    }

    this.remoteMoveFrameStart = performance.now();

    this.remoteMoveFrameTimer = createRafInterval(20, () => {
      this.playNextRemoteFrame()
    });
    this.remoteMoveFrameTimer.start();
  }

  private playNextRemoteFrame() {
    if (!this.remoteMoveFrames.length) {
      this.remoteMoveFrameTimer?.stop();
      this.remoteMoveFrameTimer = null
      return
    }

    const now = performance.now();
    while (
      this.remoteMoveFrames.length &&
      this.remoteMoveFrames[0]!.t <= now - this.remoteMoveFrameStart
    ) {
      const frame = this.remoteMoveFrames.shift()!
      this.pos = frame.pos;
    }

    window.ROOM_WORLD.events.emit('changed', { reason: 'remoteMoveFrame' });
  }

  addCommand(command: commandstate, replace = false) {
    if (replace) {
      this.clearCommands()
    }
    this.commands.push(command)
  }

  getCommands() {
    return this.commands.map(c => createUnitCommand(c));
  }

  setCommands(commands: BaseCommand<any, any>[]) {
    this.commands = commands.map(c => c.getState());
    this.setDirty();
  }

  clearCommands() {
    this.commands = []
    this.setDirty();
    window.ROOM_WORLD.events.emit('changed', { reason: 'unit' });
  }

  setFormation(formation: FormationType) {
    this.formation = formation;
    this.setDirty();
    window.ROOM_WORLD.events.emit('changed', { reason: 'unit' });
  }

  linkMessage(id: uuid) {
    if (!this.messageIds.includes(id)) {
      this.messageIds.push(id);
      this.setDirty();
      window.ROOM_WORLD.events.emit('changed', { reason: 'unit' });
    }
  }

  get messages(): ChatMessage[] {
    return window.ROOM_WORLD.messages.list().filter(m => this.messageIds.includes(m.id));
  }
}
