import {
  type commandstate,
  type FormationType,
  type unitstate,
  type unitTeam,
  unitType,
  type uuid
} from './types'
import type {MoveFrame, vec2} from "@/engine/types.ts";
import {getEnvMultipliers} from '@/engine/units/modifiers/UnitEnvModifiers.ts'
import {createRafInterval, interpolateMoveFrames, type RafInterval} from "@/engine/util.ts";
import {getFormationMultipliers} from "@/engine/units/modifiers/UnitFormationModifiers.ts";
import {createUnitCommand} from "@/engine/units/commands";
import type {BaseCommand} from "@/engine/units/commands/baseCommand.ts";
import {clamp} from "@/engine/math.ts";
import {type ChatMessage} from "@/engine/types/chatMessage.ts";
import {Team} from "@/enums/teamKeys.ts";
import {
  getAbilityMultipliers,
  type UnitAbilityType
} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {translate} from '@/i18n'
import {getTimeMultipliers} from "@/engine/units/modifiers/UnitTimeModifiers.ts";
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";
import {RoomGameStage} from "@/enums/roomStage.ts";
import {RetreatCommand} from "@/engine/units/commands/retreatCommand.ts";
import type { MoveCommandState } from './commands/moveCommand';
import type {TimeOfDay} from "@/engine/resourcePack/timeOfDay.ts";
import {type Weather} from "@/engine/resourcePack/weather.ts";
import {getWeatherMultipliers} from "@/engine/units/modifiers/UnitWeatherModifiers.ts";
import { getUnitNumberParam } from "@/engine/resourcePack/units.ts";
import { getEnvironmentMoraleCheckMod, type EnvironmentStateId } from "@/engine/resourcePack/environment.ts";
import { getMoraleCheckConfig, type MoraleOutcomeId } from "@/engine/resourcePack/moraleCheck.ts";



export type StatKey = 'damage' | 'takeDamageMod' | 'speed' | 'attackRange' | 'visionRange'

export interface StatModifierInfo {
  totalMultiplier: number
  percent: number
  sources: {
    type: 'env' | 'formation' | 'ability' | 'time' | 'weather',
    state: EnvironmentStateId | FormationType | UnitAbilityType | TimeOfDay | Weather,
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
  autoAttack: boolean = false
  futurePos: vec2 | null = null
  label = ''
  roomMapUserId: number = 0
  seenRoomUserIds: number[] = []

  angle: number = 0

  selected = false
  previewSelected = false // временное (рамка)
  futureSelected = false
  previewFutureSelected = false

  isDirty = false

  hp: number
  ammo: number
  fatigue: number

  morale: number

  abstract stats: UnitStats
  abstract abilities: UnitAbilityType[]
  public activeAbilityType: UnitAbilityType | null = null

  envState: EnvironmentStateId[] = []

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
    this.fatigue = s.fatigue ?? 0
    this.autoAttack = s.autoAttack ?? false

    this.angle = s.angle ?? 0
    this.roomMapUserId = s.roomMapUserId ?? 0
    this.seenRoomUserIds = s.seenRoomUserIds ?? []

    this.label = s.label ?? translate(`unit.${s.type}`)
    this.hp = 0;
    this.ammo = 0;
    this.morale = s.morale ?? 0;
    this.setCommands(s.commands?.map(c => createUnitCommand(c)) ?? []);

    this.formation = s.formation ?? 'default';
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
    return this.selected || this.previewSelected || this.isFutureSelected();
  }

  public isFutureSelected(): boolean {
    if (window.ROOM_WORLD.stage !== RoomGameStage.WAR) return false;
    return this.futureSelected || this.previewFutureSelected;
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
  public autoSetRetreatCommandFromAttack() {
    // Only when damage is actually taken
    if (!this.alive) return

    // Don't spam while already retreating
    if (this.isRetreat) return

    const cfg = getMoraleCheckConfig()
    const diceRolls: number[] = []
    for (let i = 0; i < cfg.dice.count; i++) diceRolls.push(this.rollDie(cfg.dice.sides))
    const diceSum = diceRolls.reduce((acc, v) => acc + v, 0)

    const mods: Array<{ key: string; value: number; applied: boolean }> = []

    // Environment morale modifier (from resourcepack).
    const envMoraleCheckMod = getEnvironmentMoraleCheckMod(this.envState)
    mods.push({ key: `fortification`, value: envMoraleCheckMod, applied: envMoraleCheckMod !== 0 })

    mods.push({ key: `morale`, value: this.morale, applied: true })

    // No commander (−2): friendly General within radius
    const commanderRuleEnabled = cfg.commander.radiusMeters > 0
    const hasCommander = !commanderRuleEnabled
      || this.type === unitType.GENERAL
      || this.hasNearbyFriendlyGeneral(cfg.commander.radiusMeters)
    mods.push({
      key: `commander`,
      value: cfg.commander.penalty,
      applied: !hasCommander && cfg.commander.penalty !== 0,
    })

    const maxHp = Number(this.stats.maxHp)
    const hp = Number(this.hp)
    const lossFraction = (Number.isFinite(maxHp) && maxHp > 0 && Number.isFinite(hp))
      ? Math.max(0, Math.min(1, 1 - hp / maxHp))
      : 0

    for (const p of cfg.lossPenalties) {
      const applied = lossFraction > p.lossesMoreThan
      mods.push({ key: p.key, value: p.penalty, applied: applied && p.penalty !== 0 })
    }

    // Unit type morale modifier (from resourcepack).
    const moraleCheckMod = getUnitNumberParam(this.type, 'moraleCheckMod') ?? 0
    mods.push({ key: `unit:${this.type}`, value: moraleCheckMod, applied: moraleCheckMod !== 0 })

    const modifierSum = mods
      .filter(m => m.applied)
      .reduce((acc, m) => acc + m.value, 0)

    const total = diceSum + modifierSum

    let outcome: MoraleOutcomeId = 'pass'
    const thresholds = [...cfg.outcomes].sort((a, b) => b.minTotal - a.minTotal)
    for (const t of thresholds) {
      if (total >= t.minTotal) {
        outcome = t.id
        break
      }
    }

    // ===== LOG (similar style to AttackCommand) =====
    const formula: string[] = []
    formula.push(`${cfg.dice.count}d${cfg.dice.sides}(${diceRolls.join('+')})=${diceSum}`)
    for (const m of mods) {
      if (m.applied && m.value !== 0) {
        const sign = m.value > 0 ? '+' : ''
        formula.push(`${m.key}(${sign}${m.value})`)
      }
    }
    formula.push(`= total(${total})`)

    window.ROOM_WORLD.logs.value.push({
      id: crypto.randomUUID(),
      time: window.ROOM_WORLD.time,
      tokens: [
        { t: 'unit', u: this.id },
        { t: 'i18n', v: `tools.logs.morale_check_from` },
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
      let retreatDuration = cfg.effects.retreatDurationSeconds;
      if (outcome === 'flee') {
        retreatDuration *= cfg.effects.fleeDurationMultiplier;
        this.hp *= cfg.effects.fleeHpMultiplier;
      }

      this.clearCommands()
      const cmd = new RetreatCommand({
        elapsed: 0,
        duration: retreatDuration,
        comment: "AUTO " + translate(`tools.logs.morale_${outcome}`)
      })
      this.setCommands([cmd]);
    }

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
      if (u.isRetreat) continue
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
      fatigue: this.fatigue,
      autoAttack: this.autoAttack,
      roomMapUserId: this.roomMapUserId,
      seenRoomUserIds: this.seenRoomUserIds,

      angle: this.angle,

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
    return (getFormationMultipliers() as any)[this.formation]?.[key] ?? 1
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
    const envMultipliers = getEnvMultipliers()

    for (const state of this.envState) {
      let m = envMultipliers[state]?.[key];
      if (
        envMultipliers[state]
        && envMultipliers[state].byTypes
        && envMultipliers[state].byTypes![this.type]
        && envMultipliers[state].byTypes![this.type]![key]
      ) {
        m = envMultipliers[state]?.byTypes![this.type]![key]
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
      const m = getAbilityMultipliers()[this.activeAbilityType]?.[key]
      if (m && m !== 1) {
        total *= m
        sources.push({ type: 'ability', state: this.activeAbilityType!, multiplier: m })
      }
    }

    // time
    if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.TIME_MODIFIERS] && getTimeMultipliers()) {
      const timeOfDay = window.ROOM_WORLD.getTimeOfDay()
      const timeMultipliers = getTimeMultipliers()
      const m = timeMultipliers[timeOfDay]?.[key] ?? 1
      if (m && m !== 1) {
        total *= m
        sources.push({ type: 'time', state: timeOfDay, multiplier: m })
      }
    }

    // weather
    if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.WEATHER_MODIFIERS]) {
      const weather = window.ROOM_WORLD.weather.value
      const weatherMul = getWeatherMultipliers()[weather]?.[key]
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

  addCommand(c: commandstate, replace = false) {
    const command = JSON.parse(JSON.stringify(c)); // Safe copy object

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
    this.refreshFuturePos();
    this.setDirty()
    window.ROOM_WORLD.units.withNewCommands.delete(this.id)
  }

  getCommands() {
    return this.commands.map(c => createUnitCommand(c));
  }

  setCommands(commands: BaseCommand<any, any>[]) {
    this.commands = commands.map(c => JSON.parse(JSON.stringify(c.getState())));
    this.refreshFuturePos();
    this.setDirty();
    window.ROOM_WORLD.units.withNewCommands.delete(this.id)
  }

  clearCommands() {
    this.commands = []
    this.refreshFuturePos();
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
      const user = message.author_team === Team.ADMIN ? 'assistant' : 'user'
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
    selfInfo.push(`position: x=${this.pos.x.toFixed(2)}, y=${this.pos.y.toFixed(2)}`)
    selfInfo.push(`hp: ${this.hp.toFixed(2)}/${this.stats.maxHp}`)
    selfInfo.push(`ammo: ${this.ammo.toFixed(2)}/${this.stats.ammoMax}`)
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
          `- id= ${u.id}, type=${u.type}, team=${u.team}, hp=${u.hp.toFixed(2)}/${u.stats.maxHp}, ` +
          `pos=(${u.pos.x.toFixed(2)}, ${u.pos.y.toFixed(2)}), ` +
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
          `hp=${a.hp.toFixed(2)}/${a.stats.maxHp}, ` +
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
          `hp=${t.hp.toFixed(2)}/${t.stats.maxHp}, ` +
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

  refreshFuturePos(): void {
    for (const cmd of this.getCommands().slice().reverse()) {
      if (cmd.type !== UnitCommandTypes.Move) continue;

      const state = cmd.getState().state as MoveCommandState
      this.futurePos = state.target
      return
    }
    this.futurePos = null
  }

  setAutoAttack(autoAttack: boolean) {
    this.autoAttack = autoAttack;
    this.setDirty();
  }

  get isRetreat() {
    return this.commands.map(c => c.type).includes(UnitCommandTypes.Retreat)
  }
}
