import {
  type commandstate,
  FormationType,
  type unitstate,
  type unitTeam,
  unitType,
  type uuid
} from './types'
import type {MoveFrame, vec2} from "@/engine/types.ts";
import {UnitEnvironmentState} from "@/engine/units/enums/UnitStates.ts";
import {ENV_MULTIPLIERS} from '@/engine/units/modifiers/UnitEnvModifiers.ts'
import {createRafInterval, interpolateMoveFrames, type RafInterval} from "@/engine/util.ts";
import {FORMATION_STAT_MULTIPLIERS} from "@/engine/units/modifiers/UnitFormationModifiers.ts";
import {createUnitCommand} from "@/engine/units/commands";
import type {BaseCommand} from "@/engine/units/commands/baseCommand.ts";
import {CommandStatus} from "@/engine/units/commands/baseCommand.ts";
import {clamp} from "@/engine/math.ts";
import {type ChatMessage} from "@/engine/types/chatMessage.ts";
import {Team} from "@/enums/teamKeys.ts";
import {
  ABILITY_MULTIPLIERS,
  type UnitAbilityType
} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {translate} from '@/i18n'
import {TIME_MULTIPLIERS, TimeOfDay} from "@/engine/units/modifiers/UnitTimeModifiers.ts";
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";
import {WEATHER_MULTIPLIERS, WeatherEnum} from "@/engine/units/modifiers/UnitWeatherModifiers.ts";
import {RoomGameStage} from "@/enums/roomStage.ts";
import {AttackCommand} from "@/engine/units/commands/attackCommand.ts";
import {RetreatCommand} from "@/engine/units/commands/retreatCommand.ts";

export type StatKey = 'damage' | 'takeDamageMod' | 'speed' | 'attackRange' | 'visionRange'

export interface StatModifierInfo {
  totalMultiplier: number
  percent: number
  sources: {
    type: 'env' | 'formation' | 'ability' | 'time' | 'weather',
    state: UnitEnvironmentState | FormationType | UnitAbilityType | TimeOfDay | WeatherEnum,
    multiplier: number
  }[]
}

export interface UnitStats {
  maxHp: number
  damage: number,
  speed: number
  takeDamageMod: number
  attackRange: number
  visionRange: number
  ammoMax: number
}

export interface MessageLinked {
  id: uuid
  time: string
}

export abstract class BaseUnit {
  static readonly COLLISION_RANGE = 30;

  id: uuid
  abstract type: unitType

  team: unitTeam
  pos: vec2
  label = ''
  isTimeout: boolean

  selected = false
  previewSelected = false // временное (рамка)

  isDirty = false

  hp: number
  ammo: number

  morale: number

  abstract stats: UnitStats
  abstract abilities: UnitAbilityType[]
  public activeAbilityType: UnitAbilityType | null = null

  envState: UnitEnvironmentState[] = []

  protected dirtyMoveStartAt = 0;
  protected lastDirtyMoveAt = 0

  protected remoteMoveFrames: MoveFrame[] = []
  protected remoteMoveFrameTimer: RafInterval | null = null
  protected remoteMoveFrameStart = 0;

  protected commands: commandstate[] = []

  protected formation: FormationType;

  protected messagesLinked: MessageLinked[] = []

  lastSelected: number = 0;

  public directView: boolean = false;

  constructor(s: unitstate) {
    this.id = s.id
    this.team = s.team
    this.pos = s.pos;

    this.label = s.label ?? translate(`unit.${s.type}`)
    this.hp = 0;
    this.ammo = 0;
    this.morale = s.morale ?? 0;
    this.commands = s.commands ?? [];
    this.isTimeout = s.isTimeout ?? false;

    this.formation = s.formation ?? FormationType.Default;
    this.activeAbilityType = s.activeAbilityType ?? null;

    this.envState = s.envState ?? [];
    this.messagesLinked = s.messagesLinked ?? [];
    this.directView = s.directView ?? false
    this.refreshEnvState();
  }

  move(to: vec2) {
    if (this.directView && window.PLAYER.team !== Team.ADMIN) {
      return;
    }
    if (window.ROOM_WORLD.stage === RoomGameStage.END) return

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
    this.ammo = clamp(s.ammo ?? this.stats.ammoMax, 0, this.stats.ammoMax)
  }

  takeDamage(amount: number): number {
    const afterMod = amount * this.takeDamageMod
    this.hp -= afterMod;
    if (this.hp <= 0) {
      this.hp = 0
    }
    this.setDirty()
    return afterMod
  }

  /**
   * Auto-set Retreat command based on a 2d6 morale/stability check.
   * Called from attack command after damage is applied.
   *
   * Rules (per request):
   * - Roll 2d6 + modifiers, compare vs "morale" as target number.
   * - If failed: Retreat 1–2 turns; big fail: Flee; critical: unit disbands.
   */
  public autoSetRetreatCommandFromAttack(attacker: BaseUnit, damage: number) {
    // Only when damage is actually taken
    if (!damage || damage <= 0) return
    if (!this.alive) return

    // Don't spam while already retreating
    if (this.hasCommand(UnitCommandTypes.Retreat) || this.isTimeout) return

    // Morale not configured => skip (prevents constant checks for default 0)
    const moraleTarget = this.morale ?? 0

    const dice1 = this.rollDie(6)
    const dice2 = this.rollDie(6)
    const diceSum = dice1 + dice2

    const mods: Array<{ key: string; value: number; applied: boolean }> = []

    // In formation (+1)
    const inFormation = [
      FormationType.Default,
      FormationType.KneelingVolley,
      FormationType.Column,
    ].includes(this.formation)
    mods.push({ key: `formation(${this.formation})`, value: 1, applied: inFormation })

    // In fortification (+2)
    const inFortification =
      this.envState.includes(UnitEnvironmentState.InCoverHouse) ||
      this.envState.includes(UnitEnvironmentState.InCoverTrenches) ||
      this.envState.includes(UnitEnvironmentState.InHouse)
    mods.push({ key: `fortification`, value: 2, applied: inFortification })

    // No commander (−2): friendly General within radius
    const hasCommander = this.type === unitType.GENERAL || this.hasNearbyFriendlyGeneral(300)
    mods.push({ key: `commander`, value: -2, applied: !hasCommander })

    // Losses > 25% (−2)
    const lossesMoreThan25 = this.hp / this.stats.maxHp < (1 - 0.25)
    mods.push({ key: `losses>25%`, value: -2, applied: lossesMoreThan25 })

    // Losses > 35% (−1)
    const lossesMoreThan35 = this.hp / this.stats.maxHp < (1 - 0.35)
    mods.push({ key: `losses>35%`, value: -1, applied: lossesMoreThan35 })

    // Losses > 50% (−2)
    const lossesMoreThan50 = this.hp / this.stats.maxHp < (1 - 0.50)
    mods.push({ key: `losses>50%`, value: -2, applied: lossesMoreThan50 })

    // Elite (+2): treat marines as elite (until a dedicated tag exists)
    const isElite = this.type === unitType.MARINE
    mods.push({ key: `elite`, value: 2, applied: isElite })

    // Militia (−2)
    const isMilitia = this.type === unitType.MILITIA
    mods.push({ key: `militia`, value: -2, applied: isMilitia })

    const modifierSum = mods
      .filter(m => m.applied)
      .reduce((acc, m) => acc + m.value, 0)

    const total = diceSum + modifierSum
    const margin = total - moraleTarget

    type MoraleOutcome = 'pass' | 'retreat' | 'flee' | 'disband'
    let outcome: MoraleOutcome = 'pass'

    // Thresholds by margin of failure
    if (margin >= 0) {
      outcome = 'pass'
    } else if (margin >= -2) {
      outcome = 'retreat'
    } else if (margin >= -5) {
      outcome = 'flee'
    } else {
      outcome = 'disband'
    }

    // ===== LOG (similar style to AttackCommand) =====
    const formula: string[] = []
    formula.push(`2d6(${dice1}+${dice2})=${diceSum}`)
    for (const m of mods) {
      if (m.applied && m.value !== 0) {
        const sign = m.value > 0 ? '+' : ''
        formula.push(`${m.key}(${sign}${m.value})`)
      }
    }
    formula.push(`= total(${total})`)
    formula.push(`vs morale(${moraleTarget})`)
    formula.push(`margin(${margin})`)

    window.ROOM_WORLD.logs.value.push({
      id: crypto.randomUUID(),
      time: window.ROOM_WORLD.time,
      tokens: [
        { t: 'unit', u: this.id },
        { t: 'i18n', v: `tools.logs.morale_check_from` },
        { t: 'unit', u: attacker.id },
        { t: 'text', v: ' → ' },
        { t: 'i18n', v: `tools.logs.morale_${outcome}` },
        { t: 'text', v: ' (' },
        { t: 'formula', v: formula.join(' + ') },
        { t: 'text', v: ')' },
      ],
      is_new: true,
    })

    // ===== APPLY EFFECT =====
    if (outcome === 'pass') return

    if (outcome === 'disband') {
      // unit disbands
      this.hp = 0
    } else {
      this.clearCommands()
      const cmd = new RetreatCommand({
        elapsed: 0,
        duration: 60 * 60 * 24,
        comment: "AUTO"
      })
      this.setCommands([cmd]);
    }

    this.isTimeout = true
    this.setDirty()
    window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
  }

  private rollDie(sides: number): number {
    return 1 + Math.floor(Math.random() * sides)
  }

  private hasCommand(type: UnitCommandTypes): boolean {
    return this.commands.some(c => c.type === type)
  }

  private hasNearbyFriendlyGeneral(radiusMeters: number): boolean {
    const rPx = radiusMeters / window.ROOM_WORLD.map.metersPerPixel
    const r2 = rPx * rPx
    for (const u of window.ROOM_WORLD.units.list()) {
      if (!u.alive) continue
      if (u.isTimeout) continue
      if (u.team !== this.team) continue
      if (u.type !== unitType.GENERAL) continue
      const dx = u.pos.x - this.pos.x
      const dy = u.pos.y - this.pos.y
      if (dx * dx + dy * dy <= r2) return true
    }
    return false
  }

  toState(): unitstate {
    return {
      id: this.id,
      type: this.type,
      team: this.team,
      pos: this.pos,

      isTimeout: this.isTimeout,

      label: this.label,

      hp: this.hp,
      ammo: this.ammo,

      morale: this.morale,

      commands: this.commands,

      envState: this.envState,

      formation: this.formation,

      messagesLinked: this.messagesLinked,

      directView: this.directView,

      activeAbilityType: this.activeAbilityType,
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

  protected getStatMultiplier<K extends StatKey>(
    key: K
  ): number {
    return this.getStatModifierInfo(key).totalMultiplier
  }

  protected getFormationMultiplier<K extends keyof UnitStats | 'damage'>(
    key: K
  ): number {
    return FORMATION_STAT_MULTIPLIERS[this.formation]?.[key] ?? 1
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get takeDamageMod(): number {
    return this.stats.takeDamageMod * this.getStatMultiplier('takeDamageMod')
  }

  get damage(): number {
    return this.stats.damage * this.getStatMultiplier('damage')
  }

  get attackRange(): number {
    return this.stats.attackRange * this.getStatMultiplier('attackRange')
  }

  get visionRange(): number {
    return this.stats.visionRange * this.getStatMultiplier('visionRange')
  }

  get speed(): number {
    return this.stats.speed * this.getStatMultiplier('speed')
  }

  get height(): number {
    return window.ROOM_WORLD.getHeightAt(this.pos);
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
        && ENV_MULTIPLIERS[state].byTypes[this.type]![key]
      ) {
        m = ENV_MULTIPLIERS[state]?.byTypes[this.type]![key]
      }
      if (m !== undefined) {
        total *= m
        sources.push({ type: 'env', state, multiplier: m })
      }
    }

    // formation
    if (this.getFormationMultiplier(key) != 1) {
      const m = this.getFormationMultiplier(key)
      total *= m
      sources.push({ type: 'formation', state: this.formation, multiplier: m })
    }

    // ability
    if (this.activeAbilityType) {
      const m = ABILITY_MULTIPLIERS[this.activeAbilityType]?.[key]
      if (m && m !== 1) {
        total *= m
        sources.push({ type: 'ability', state: this.activeAbilityType!, multiplier: m })
      }
    }

    // time
    if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.TIME_MODIFIERS]) {
      const timeOfDay = window.ROOM_WORLD.getTimeOfDay()
      const m = TIME_MULTIPLIERS[timeOfDay]?.[key]
      if (m && m !== 1) {
        total *= m
        sources.push({ type: 'time', state: timeOfDay, multiplier: m })
      }
    }

    // weather
    if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.WEATHER_MODIFIERS]) {
      const weather = window.ROOM_WORLD.weather.value
      const weatherMul = WEATHER_MULTIPLIERS[weather]?.[key]
      if (weatherMul && weatherMul !== 1) {
        total *= weatherMul
        sources.push({ type: 'weather', state: weather, multiplier: weatherMul })
      }
    }

    return {
      totalMultiplier: total,
      percent: Math.round((total) * 100),
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

  protected playNextRemoteFrame() {
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
    this.commands = this.commands.filter(cmd =>
      !(cmd.type === UnitCommandTypes.Wait &&
        (cmd.state.wait === 0 || cmd.state.wait === Infinity))
    )
    if (command.type === UnitCommandTypes.Attack) {
      this.commands = this.commands.filter(cmd => cmd.type !== UnitCommandTypes.Attack)
    }
    this.commands.push(command)
    this.setDirty()
    window.ROOM_WORLD.units.withNewCommands.delete(this.id)
  }

  getCommands() {
    return this.commands.map(c => createUnitCommand(c));
  }

  setCommands(commands: BaseCommand<any, any>[]) {
    this.commands = commands.map(c => c.getState());
    this.setDirty();
    window.ROOM_WORLD.units.withNewCommands.delete(this.id)
  }

  clearCommands() {
    this.isTimeout = false;
    this.commands = []
    this.setDirty();
    window.ROOM_WORLD.events.emit('changed', { reason: 'unit' });
    window.ROOM_WORLD.units.withNewCommands.delete(this.id)
  }

  setFormation(formation: FormationType) {
    this.formation = formation;
    this.setDirty();
    window.ROOM_WORLD.events.emit('changed', { reason: 'unit' });
    window.ROOM_WORLD.units.withNewCommands.delete(this.id)
  }

  linkMessage(id: uuid) {
    for (const m of this.messagesLinked) {
      if (m.id === id) return
    }
    this.messagesLinked.push({id: id, time: window.ROOM_WORLD.time});
    this.setDirty();
    window.ROOM_WORLD.events.emit('changed', { reason: 'unit' });
  }

  get messages(): ChatMessage[] {
    const result: ChatMessage[] = []

    for (const messageLinked of this.messagesLinked) {
      const m = window.ROOM_WORLD.messages.get(messageLinked.id)
      if (!m) continue
      result.push({
        ...m,
        time: messageLinked.time,
      })
    }

    return result
  }

  activateAbility(newAbilityType: UnitAbilityType | null) {
    this.activeAbilityType = newAbilityType
    this.setDirty()
  }

  getFormation(): FormationType {
    return this.formation
  }

  getAiReport(): {user: string, text: string}[] {
    let result: { user: string; text: string; }[] = []

    // Message history
    const messages = this.messages
    for (const message of messages) {
      const user = message.unitIds.includes(this.id) ? 'assistant' : 'user'
      result.push({
        user: user,
        text: message.text,
      })
    }

    // Stat self info
    const selfInfo: string[] = []
    selfInfo.push(`UNIT INFO`)
    selfInfo.push(`type: ${this.type}`)
    selfInfo.push(`team: ${this.team}`)
    selfInfo.push(`position: x=${Math.round(this.pos.x)}, y=${Math.round(this.pos.y)}`)
    selfInfo.push(`hp: ${this.hp}/${this.stats.maxHp}`)
    selfInfo.push(`ammo: ${this.ammo}/${this.stats.ammoMax}`)
    selfInfo.push(`morale: ${this.morale}`)
    selfInfo.push(`formation: ${this.formation}`)
    selfInfo.push(`alive: ${this.alive}`)

    // Env state
    if (this.envState.length) {
      selfInfo.push(``)
      selfInfo.push(`ENVIRONMENT STATES:`)
      for (const s of this.envState) {
        selfInfo.push(`- ${s}`)
      }
    }

    // Active ability
    if (this.activeAbilityType) {
      selfInfo.push(``)
      selfInfo.push(`ACTIVE ABILITY: ${this.activeAbilityType}`)
    }

    // DirectView units
    const visibleUnits = window.ROOM_WORLD.units.getDirectView(this)
    selfInfo.push(``)
    selfInfo.push(`VISIBLE UNITS:`)
    if (!visibleUnits.length) {
      selfInfo.push(`- none`)
    } else {
      for (const u of visibleUnits) {
        if (u.id === this.id) continue
        if (!u.alive) continue
        const dist = Math.hypot(this.pos.x - u.pos.x, this.pos.y - u.pos.y) * window.ROOM_WORLD.map.metersPerPixel;

        selfInfo.push(
          `- id= ${u.id}, type=${u.type}, team=${u.team}, hp=${u.hp}/${u.stats.maxHp}, ` +
          `pos=(${Math.round(u.pos.x)}, ${Math.round(u.pos.y)}), ` +
          `distance=${Math.round(dist)} meters, `
        )
      }
    }

    // Attackers
    const attackers = window.ROOM_WORLD.units
      .list()
      .filter(u => {
        if (u.id === this.id) return false
        if (!u.alive) return false

        return u.commands.some(cmd =>
          cmd.type === UnitCommandTypes.Attack &&
          cmd.state?.targets.some(id => id === this.id)
        )
      })
    selfInfo.push(``)
    selfInfo.push(`ATTACKERS:`)
    if (!attackers.length) {
      selfInfo.push(`- none`)
    } else {
      for (const a of attackers) {
        const dist = Math.hypot(
          this.pos.x - a.pos.x,
          this.pos.y - a.pos.y
        ) * window.ROOM_WORLD.map.metersPerPixel

        selfInfo.push(
          `- type=${a.type}, team=${a.team}, ` +
          `hp=${a.hp}/${a.stats.maxHp}, ` +
          `distance=${Math.round(dist)} meters`
        )
      }
    }

    // Targets
    const targets = this.commands
      .filter(cmd => cmd.type === UnitCommandTypes.Attack)
      .map(
        cmd => cmd.state.targets.map(t => window.ROOM_WORLD.units.get(t))
      )
      .flat()
      .filter((u): u is BaseUnit => Boolean(u && u.alive))
    selfInfo.push(``)
    selfInfo.push(`TARGETS:`)
    if (!targets.length) {
      selfInfo.push(`- none`)
    } else {
      for (const t of targets) {
        const dist = Math.hypot(
          this.pos.x - t.pos.x,
          this.pos.y - t.pos.y
        ) * window.ROOM_WORLD.map.metersPerPixel

        selfInfo.push(
          `- type=${t.type}, team=${t.team}, ` +
          `hp=${t.hp}/${t.stats.maxHp}, ` +
          `distance=${Math.round(dist)} meters`
        )
      }
    }

    // world state
    selfInfo.push(``)
    selfInfo.push(`WORLD:`)
    selfInfo.push(`timeOfDay: ${window.ROOM_WORLD.getTimeOfDay()}`)
    selfInfo.push(`weather: ${window.ROOM_WORLD.weather.value}`)

    result.push({
      user: 'user',
      text: selfInfo.join('\n'),
    })

    console.log(selfInfo.join('\n'))

    return result
  }
}
