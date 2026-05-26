import {BaseCommand} from "./baseCommand.ts";
import {BaseUnit} from "@/engine/units/baseUnit.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import type {vec2} from "@/engine/types.ts";
import {unitType, type uuid} from "@/engine";
import {buildRoadTurnRoutePoints} from "@/engine/world/roadPath.ts";
import {MoveCommand} from "@/engine/units/commands/moveCommand.ts";
import type {MoveCommandState} from "@/engine/units/commands/moveCommand.ts";
import {Team} from "@/enums/teamKeys.ts";
import {ChatMessageStatus} from "@/engine/types/chatMessage.ts";
import {getMessengerLogicConfig} from "@/engine/resourcePack/messengerLogic.ts";
import {buildMessengerRouteByNearestPoints} from "@/engine/units/messengerRoute.ts";
import {buildVisionPolygon, pointInPolygon} from "@/engine/2d/render";
import { applyReadyMessageOrdersToUnit } from "@/engine/units/messageOrders.ts";

export interface DeliveryCommandState {
  targets: uuid[],
  targetsDelivered?: uuid[],
  attackedTargets?: uuid[],
  instantDelivery?: boolean,
  delivered?: boolean,
  messageId?: uuid | null,
  messengerId?: uuid | null,
  quotedMessageId?: uuid | null,
  sourceUnitId?: uuid | null,
  manualRoutePoints?: vec2[],
  manualRouteIsPath?: boolean,
  route?: vec2[],
  routeIndex?: number,
  routeKind?: 'manual' | 'auto',
  routeTargetId?: uuid | null,
  routeThreatSignature?: string | null,
  returnRoute?: vec2[],
  returnRouteIndex?: number,
  deliveryTargetId?: uuid | null,
  deliveryStatus?: 'pending' | 'in_transit' | 'delivered' | 'failed' | 'intercepted',
  returnReason?: 'target_not_found' | 'enemy_spotted' | 'intercepted' | null,
  returning?: boolean,
  hpDeltaApplied?: boolean,
  returnHpApplied?: boolean,
  reportSent?: boolean,
  reachedTarget?: boolean,
  enemySightings?: vec2[],
  outboundTrace?: vec2[],
  rerouteEnemySignature?: string | null,
}

export class DeliveryCommand extends BaseCommand<
  UnitCommandTypes.Delivery,
  DeliveryCommandState
> {
  private static readonly DELIVERY_RANGE_MULTIPLIER = 2;
  private static readonly ENEMY_THREAT_RADIUS_METERS = 1000;
  private static readonly MAX_ENEMY_SIGHTINGS = 24;
  private static readonly OUTBOUND_TRACE_MAX_POINTS = 1200;
  private static readonly OUTBOUND_TRACE_MIN_STEP_PX = 8;
  private static readonly PERF_LOG_PREFIX = "[DeliveryRoutePerf]";
  static readonly DELIVERY_MOVE_COMMENT = "#delivery#";

  readonly type: UnitCommandTypes.Delivery =
    UnitCommandTypes.Delivery

  constructor(private state: DeliveryCommandState) {
    super()
  }

  private getDeliveryRange(): number {
    return BaseUnit.COLLISION_RANGE * DeliveryCommand.DELIVERY_RANGE_MULTIPLIER;
  }

  private distanceTo(unit: BaseUnit, target: BaseUnit): number {
    return Math.hypot(
      target.pos.x - unit.pos.x,
      target.pos.y - unit.pos.y
    );
  }

  private resolveDeliveryTarget(unit: BaseUnit): BaseUnit | null {
    if (this.state.returning) {
      return this.resolveReturnTarget(unit);
    }

    const pendingTargetIds = this.getPendingTargetIds()
    const targetUnits = pendingTargetIds
      .map((id) => window.ROOM_WORLD.units.get(id))
      .filter((u): u is BaseUnit => Boolean(u && u.alive));

    if (!targetUnits.length) return null;

    const nonGeneralTargets = targetUnits.filter((u) => (
      u.type !== unitType.GENERAL && u.id !== this.state.sourceUnitId
    ));
    if (nonGeneralTargets.length) {
      const nearestTarget = nonGeneralTargets
        .slice()
        .sort((a, b) => this.distanceTo(unit, a) - this.distanceTo(unit, b))[0]!;
      this.state.deliveryTargetId = nearestTarget.id;
      return nearestTarget;
    }

    const generals = targetUnits.filter((u) => u.type === unitType.GENERAL);
    if (generals.length) {
      if (this.state.deliveryTargetId) {
        const stored = generals.find((u) => u.id === this.state.deliveryTargetId);
        if (stored) return stored;
      }
      const nearestGeneral = generals
        .slice()
        .sort((a, b) => this.distanceTo(unit, a) - this.distanceTo(unit, b))[0]!;
      this.state.deliveryTargetId = nearestGeneral.id;
      return nearestGeneral;
    }

    // Fallback: route to nearest remaining target.
    const nearestTarget = targetUnits
      .slice()
      .sort((a, b) => this.distanceTo(unit, a) - this.distanceTo(unit, b))[0]!;
    this.state.deliveryTargetId = nearestTarget.id;
    return nearestTarget;
  }

  static isDeliveryMoveComment(comment: unknown): boolean {
    return typeof comment === "string" && comment.includes(DeliveryCommand.DELIVERY_MOVE_COMMENT);
  }

  private hasPendingDeliveryMove(unit: BaseUnit): boolean {
    return unit.getCommands().some((command) => {
      if (command.type !== UnitCommandTypes.Move) return false;
      if (command.isFinished(unit)) return false;
      const moveState = command.getState().state as MoveCommandState;
      return DeliveryCommand.isDeliveryMoveComment(moveState.comment);
    });
  }

  private hasPendingRegularMove(unit: BaseUnit): boolean {
    return unit.getCommands().some((command) => {
      if (command.type !== UnitCommandTypes.Move) return false;
      if (command.isFinished(unit)) return false;
      const moveState = command.getState().state as MoveCommandState;
      return !DeliveryCommand.isDeliveryMoveComment(moveState.comment);
    });
  }

  private buildDeliveryRoute(goal: vec2, from: vec2): vec2[] {
    const startedAt = this.nowMs()
    const threatZones = this.getEnemyThreatZones()
    const points = buildRoadTurnRoutePoints(
      window.ROOM_WORLD,
      from,
      goal,
      threatZones.length ? { threatZones } : undefined
    );
    const durationMs = this.nowMs() - startedAt
    this.logPerf('build_delivery_route', {
      durationMs,
      threatZones: threatZones.length,
      from: { x: from.x, y: from.y },
      goal: { x: goal.x, y: goal.y },
      resultPoints: points.length,
    })
    if (points.length) return points;
    return [{ x: goal.x, y: goal.y }];
  }

  private getEnemyThreatZones(): Array<{ x: number; y: number; radiusPx: number }> {
    const sightings = this.state.enemySightings ?? []
    if (!sightings.length) return []
    const metersPerPixel = Math.max(0.0001, window.ROOM_WORLD.map.metersPerPixel)
    const radiusPx = DeliveryCommand.ENEMY_THREAT_RADIUS_METERS / metersPerPixel
    return sightings.map((sighting) => ({
      x: sighting.x,
      y: sighting.y,
      radiusPx,
    }))
  }

  private isPointInThreatZone(
    point: vec2,
    threatZones: Array<{ x: number; y: number; radiusPx: number }>
  ): boolean {
    for (const zone of threatZones) {
      const dx = point.x - zone.x
      const dy = point.y - zone.y
      if ((dx * dx + dy * dy) <= (zone.radiusPx * zone.radiusPx)) {
        return true
      }
    }
    return false
  }

  private pruneIntermediateThreatenedWaypoints(waypoints: vec2[]): vec2[] {
    if (waypoints.length <= 2) return waypoints
    const threatZones = this.getEnemyThreatZones()
    if (!threatZones.length) return waypoints
    const lastIdx = waypoints.length - 1
    return waypoints.filter((point, idx) => {
      if (idx === 0 || idx === lastIdx) return true
      return !this.isPointInThreatZone(point, threatZones)
    })
  }

  private buildRouteThroughWaypoints(from: vec2, waypoints: vec2[]): vec2[] {
    if (!waypoints.length) return []
    const route: vec2[] = []
    let cursor: vec2 = { x: from.x, y: from.y }

    const samePoint = (a: vec2, b: vec2, eps = 0.001) =>
      Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps

    for (const waypoint of waypoints) {
      const segment = this.buildDeliveryRoute(waypoint, cursor)
      for (const point of segment) {
        const normalized = { x: point.x, y: point.y }
        if (!route.length || !samePoint(route[route.length - 1]!, normalized)) {
          route.push(normalized)
        }
      }
      if (route.length) {
        cursor = route[route.length - 1]!
      } else {
        cursor = { x: waypoint.x, y: waypoint.y }
      }
    }

    return route
  }

  private isSamePoint(a: vec2, b: vec2, eps = 0.001): boolean {
    return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps
  }

  private findNearestRouteIndex(pos: vec2, route: vec2[]): number {
    if (!route.length) return -1
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < route.length; i += 1) {
      const dx = route[i]!.x - pos.x
      const dy = route[i]!.y - pos.y
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    return bestIdx
  }

  private routePointKey(point: vec2): string {
    const precision = 10
    return `${Math.round(point.x / precision)}:${Math.round(point.y / precision)}`
  }

  private simplifyRouteWithoutLoops(route: vec2[]): vec2[] {
    const simplified: vec2[] = []
    const indexByPointKey = new Map<string, number>()

    for (const point of route) {
      const normalized = { x: point.x, y: point.y }
      const pointKey = this.routePointKey(normalized)
      const existingIdx = indexByPointKey.get(pointKey)
      if (existingIdx !== undefined) {
        for (let i = simplified.length - 1; i > existingIdx; i -= 1) {
          indexByPointKey.delete(this.routePointKey(simplified[i]!))
          simplified.pop()
        }
        continue
      }
      simplified.push(normalized)
      indexByPointKey.set(pointKey, simplified.length - 1)
    }

    return simplified
  }

  private buildReturnRouteFromCurrentPosition(unit: BaseUnit): vec2[] {
    const sourceRoute = this.state.outboundTrace?.length
      ? this.state.outboundTrace
      : (this.state.route ?? [])
    if (!sourceRoute.length) return []
    const nearestIdx = this.findNearestRouteIndex(unit.pos, sourceRoute)
    if (nearestIdx < 0) return []
    const passedRoute = sourceRoute.slice(0, nearestIdx + 1)
    const simplifiedPassedRoute = this.simplifyRouteWithoutLoops(passedRoute)
    const result = simplifiedPassedRoute.reverse()
    this.logPerf('build_return_route_from_trace', {
      source: this.state.outboundTrace?.length ? 'outbound_trace' : 'route',
      sourcePoints: sourceRoute.length,
      passedPoints: passedRoute.length,
      resultPoints: result.length,
      nearestIdx,
    })
    return result
  }

  private nowMs(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now()
    }
    return Date.now()
  }

  private logPerf(event: string, details: Record<string, unknown> = {}) {
    console.debug(`${DeliveryCommand.PERF_LOG_PREFIX} ${event}`, {
      messengerId: this.state.messengerId ?? null,
      returning: Boolean(this.state.returning),
      ...details,
    })
  }

  private rememberOutboundTracePoint(point: vec2) {
    if (this.state.returning) return
    if (!this.state.outboundTrace) {
      this.state.outboundTrace = []
    }
    const trace = this.state.outboundTrace
    const normalized = { x: point.x, y: point.y }
    const last = trace[trace.length - 1]
    if (last) {
      const dist = Math.hypot(normalized.x - last.x, normalized.y - last.y)
      if (dist < DeliveryCommand.OUTBOUND_TRACE_MIN_STEP_PX) return
    }
    trace.push(normalized)
    if (trace.length > DeliveryCommand.OUTBOUND_TRACE_MAX_POINTS) {
      trace.splice(0, trace.length - DeliveryCommand.OUTBOUND_TRACE_MAX_POINTS)
    }
  }

  private getThreatSignature(): string {
    const sightings = this.state.enemySightings ?? []
    if (!sightings.length) return "none"
    return sightings
      .map((point) => `${Math.round(point.x / 25)}:${Math.round(point.y / 25)}`)
      .sort()
      .join("|")
  }

  private getEnemyUnitsSignature(enemies: BaseUnit[]): string {
    if (!enemies.length) return "none"
    return enemies
      .map((enemy) => `${Math.round(enemy.pos.x / 25)}:${Math.round(enemy.pos.y / 25)}`)
      .sort()
      .join("|")
  }

  private clearAutoRouteCache() {
    if (this.state.routeKind !== 'auto') return
    this.state.route = []
    this.state.routeIndex = 0
    this.state.routeKind = undefined
    this.state.routeTargetId = null
    this.state.routeThreatSignature = null
  }

  private buildDirectRouteFromWaypoints(from: vec2, waypoints: vec2[]): vec2[] {
    if (!waypoints.length) return []
    const route: vec2[] = []
    let previousPoint: vec2 = { x: from.x, y: from.y }
    for (const point of waypoints) {
      const normalized = { x: point.x, y: point.y }
      if (!this.isSamePoint(previousPoint, normalized)) {
        route.push(normalized)
        previousPoint = normalized
      }
    }
    return route
  }

  private clampHp(unit: BaseUnit, hp: number): number {
    const maxHp = unit.stats.maxHp
    if (!Number.isFinite(maxHp) || maxHp <= 0) return hp
    return Math.max(0, Math.min(maxHp, hp))
  }

  private applySpawnHpDeltaIfNeeded() {
    if (this.state.hpDeltaApplied) return
    const sourceUnitId = this.state.sourceUnitId
    const sourceUnit = sourceUnitId
      ? window.ROOM_WORLD.units.get(sourceUnitId)
      : null
    if (!sourceUnit || !sourceUnit.alive) {
      this.state.hpDeltaApplied = true
      return
    }
    const messengerLogic = getMessengerLogicConfig()
    sourceUnit.hp = this.clampHp(sourceUnit, sourceUnit.hp + messengerLogic.spawnHpDelta)
    sourceUnit.setDirty()
    this.state.hpDeltaApplied = true
  }

  private applyReturnHpDeltaIfNeeded() {
    if (this.state.returnHpApplied) return
    const sourceUnitId = this.state.sourceUnitId
    const sourceUnit = sourceUnitId
      ? window.ROOM_WORLD.units.get(sourceUnitId)
      : null
    if (!sourceUnit || !sourceUnit.alive) {
      this.state.returnHpApplied = true
      return
    }
    const messengerLogic = getMessengerLogicConfig()
    sourceUnit.hp = this.clampHp(sourceUnit, sourceUnit.hp + messengerLogic.returnHpDelta)
    sourceUnit.setDirty()
    this.state.returnHpApplied = true
  }

  private emitDeliveryStatus(status: DeliveryCommandState['deliveryStatus']) {
    this.state.deliveryStatus = status
    if (!this.state.messageId) return
    const roomUserIds = Array.from(new Set(
      this.state.targets
        .map((id) => window.ROOM_WORLD.units.get(id)?.roomMapUserId ?? 0)
        .filter((id) => id > 0)
    ));
    const payload: {
      id: uuid
      roomUserIds: number[]
      time: string
      messengerId?: uuid
      quotedMessageId?: uuid | null
      deliveryStatus?: 'pending' | 'in_transit' | 'delivered' | 'failed' | 'intercepted'
    } = {
      id: this.state.messageId,
      roomUserIds,
      time: window.ROOM_WORLD.time,
      quotedMessageId: this.state.quotedMessageId ?? null,
      deliveryStatus: status ?? 'pending',
    }
    if (this.state.messengerId) {
      payload.messengerId = this.state.messengerId
    }
    const isFinalStatus = status === 'delivered' || status === 'failed' || status === 'intercepted'
    window.ROOM_WORLD.events.emit('api', {
      type: isFinalStatus ? 'messenger_delivery' : 'messenger_delivery_update',
      data: payload
    });
  }

  private buildReportText(reason: NonNullable<DeliveryCommandState['returnReason']>): string {
    if (reason === 'enemy_spotted') {
      return '#i18n.chat.messenger.enemy_spotted'
    }
    if (reason === 'intercepted') {
      return '#i18n.chat.messenger.intercepted'
    }
    return '#i18n.chat.messenger.target_not_found'
  }

  private sendReportIfNeeded(unit: BaseUnit, reason: NonNullable<DeliveryCommandState['returnReason']>) {
    if (this.state.reportSent) return
    const team = unit.team === 'red' ? Team.RED : Team.BLUE
    const reportId = crypto.randomUUID()
    window.ROOM_WORLD.addMessage({
      id: reportId,
      author: 'Messenger',
      author_team: Team.ADMIN,
      unitIds: [],
      text: this.buildReportText(reason),
      time: window.ROOM_WORLD.time,
      created_at: new Date().toISOString(),
      delivered_at: null,
      quotedMessageId: this.state.quotedMessageId ?? this.state.messageId ?? null,
      team,
      status: ChatMessageStatus.Sent,
      delivered: false,
      deliveryStatus: 'failed',
    })
    this.emitDeliveryStatus('failed')
    this.state.reportSent = true
  }

  private sendSuccessReportIfNeeded(unit: BaseUnit) {
    if (this.state.reportSent) return
    if (!this.shouldReturnAfterSuccessfulDelivery()) return
    if (!this.state.sourceUnitId) return
    const team = unit.team === 'red' ? Team.RED : Team.BLUE
    const reportId = crypto.randomUUID()
    const undeliveredUnitIds = this.getPendingTargetIds()
    const attackedTargets = this.state.attackedTargets ?? []
    const textLines = [
      this.hasUndeliveredTargets()
        ? '#i18n.chat.messenger.partial_delivered'
        : '#i18n.chat.messenger.order_delivered',
    ]
    if (undeliveredUnitIds.length) {
      textLines.push(`#i18n.chat.messenger.not_found_units ${this.buildUnitTagsList(undeliveredUnitIds)}`)
    }
    if (attackedTargets.length) {
      textLines.push(`#i18n.chat.messenger.units_in_battle ${this.buildUnitTagsList(attackedTargets)}`)
    }
    window.ROOM_WORLD.addMessage({
      id: reportId,
      author: 'Messenger',
      author_team: Team.ADMIN,
      unitIds: this.state.targetsDelivered ?? [],
      text: textLines.join('\n'),
      time: window.ROOM_WORLD.time,
      created_at: new Date().toISOString(),
      delivered_at: null,
      quotedMessageId: this.state.quotedMessageId ?? this.state.messageId ?? null,
      team,
      status: ChatMessageStatus.Sent,
      delivered: false,
      deliveryStatus: 'delivered',
    })
    this.state.reportSent = true
  }

  private shouldReturnAfterSuccessfulDelivery(): boolean {
    if (!this.state.messageId) return false
    const message = window.ROOM_WORLD.messages.get(this.state.messageId)
    if (!message) return false
    return message.author_team === Team.RED || message.author_team === Team.BLUE
  }

  private removePendingDeliveryMoves(unit: BaseUnit) {
    const filtered = unit.getCommands().filter((command) => {
      if (command.type !== UnitCommandTypes.Move) return true
      const moveState = command.getState().state as MoveCommandState
      return !DeliveryCommand.isDeliveryMoveComment(moveState.comment)
    })
    unit.setCommands(filtered)
  }

  private resolveEnemiesThatCanSeeUnit(unit: BaseUnit): BaseUnit[] {
    const enemies = window.ROOM_WORLD.units.list().filter((candidate) => (
      candidate.alive
      && candidate.team !== unit.team
      && candidate.type !== unitType.MESSENGER
      && candidate.stats.visionRange > 0
    ))
    const metersPerPixel = window.ROOM_WORLD.map.metersPerPixel
    const visibleEnemies: BaseUnit[] = []
    for (const enemy of enemies) {
      const maxVisionDistPx = enemy.visionRange / metersPerPixel
      const dx = unit.pos.x - enemy.pos.x
      const dy = unit.pos.y - enemy.pos.y
      if ((dx * dx + dy * dy) > (maxVisionDistPx * maxVisionDistPx)) continue
      const polygon = buildVisionPolygon(enemy, window.ROOM_WORLD)
      if (pointInPolygon(unit.pos, polygon)) {
        visibleEnemies.push(enemy)
      }
    }
    return visibleEnemies
  }

  private isVisibleForEnemy(unit: BaseUnit): boolean {
    return this.resolveEnemiesThatCanSeeUnit(unit).length > 0
  }

  private rememberEnemySightings(enemies: BaseUnit[]) {
    if (!enemies.length) return
    if (!this.state.enemySightings) this.state.enemySightings = []
    const approxMergeDistancePx = Math.max(4, 150 / Math.max(0.0001, window.ROOM_WORLD.map.metersPerPixel))
    const approxMergeDistanceSq = approxMergeDistancePx * approxMergeDistancePx
    for (const enemy of enemies) {
      const existingIdx = this.state.enemySightings.findIndex((sighting) => {
        const dx = sighting.x - enemy.pos.x
        const dy = sighting.y - enemy.pos.y
        return (dx * dx + dy * dy) <= approxMergeDistanceSq
      })
      const enemyPos = { x: enemy.pos.x, y: enemy.pos.y }
      if (existingIdx >= 0) {
        this.state.enemySightings[existingIdx] = enemyPos
      } else {
        this.state.enemySightings.push(enemyPos)
      }
    }
    if (this.state.enemySightings.length > DeliveryCommand.MAX_ENEMY_SIGHTINGS) {
      this.state.enemySightings = this.state.enemySightings.slice(
        this.state.enemySightings.length - DeliveryCommand.MAX_ENEMY_SIGHTINGS
      )
    }
  }

  private maybeInterceptedByEnemy(unit: BaseUnit): boolean {
    if (!this.isVisibleForEnemy(unit)) return false
    const chance = getMessengerLogicConfig().enemyKillChancePerTick
    if (Math.random() > chance) return false
    this.state.returnReason = 'intercepted'
    this.emitDeliveryStatus('intercepted')
    this.state.delivered = true
    window.ROOM_WORLD.units.remove(unit.id);
    return true
  }

  private isUmpireReportDelivery(): boolean {
    if (!this.state.messageId) return false
    const message = window.ROOM_WORLD.messages.get(this.state.messageId)
    if (!message) return false
    return message.author_team === Team.ADMIN
  }

  private rerouteAfterEnemySpotted(unit: BaseUnit, visibleEnemies: BaseUnit[]): boolean {
    if (!visibleEnemies.length) return false
    const canReroute = this.state.returning || this.isUmpireReportDelivery()
    if (!canReroute) return false
    const enemySignature = this.getEnemyUnitsSignature(visibleEnemies)
    const sameThreat = this.state.rerouteEnemySignature === enemySignature
    if (sameThreat && this.hasPendingDeliveryMove(unit)) {
      this.logPerf('skip_reroute_same_enemy_signature', {
        enemySignature,
      })
      return false
    }

    if (this.state.returning) {
      // Keep original return waypoints and rebuild from nearest point with threat zones.
      this.syncReturnRouteIndexToNearest(unit)
    } else {
      // Umpire reports should not "panic-turn"; just rebuild route with threat zones.
      this.state.manualRoutePoints = []
      this.state.route = []
      this.state.routeIndex = 0
    }

    this.state.rerouteEnemySignature = enemySignature
    this.removePendingDeliveryMoves(unit)
    this.ensureDeliveryMoveCommands(unit)
    return true
  }

  private resolveReturnTarget(unit: BaseUnit): BaseUnit | null {
    if (this.state.sourceUnitId) {
      const sourceUnit = window.ROOM_WORLD.units.get(this.state.sourceUnitId)
      if (sourceUnit && sourceUnit.alive) {
        return sourceUnit
      }
    }

    const nearestFriendlyGeneral = window.ROOM_WORLD.units
      .list()
      .filter((candidate) => (
        candidate.alive
        && candidate.team === unit.team
        && candidate.type === unitType.GENERAL
      ))
      .sort((a, b) => this.distanceTo(unit, a) - this.distanceTo(unit, b))[0] ?? null

    if (nearestFriendlyGeneral) {
      this.state.sourceUnitId = nearestFriendlyGeneral.id
      return nearestFriendlyGeneral
    }

    const nearestFriendlyTarget = this.getPendingTargetIds()
      .map((id) => window.ROOM_WORLD.units.get(id))
      .filter((candidate): candidate is BaseUnit => Boolean(candidate && candidate.alive && candidate.team === unit.team))
      .sort((a, b) => this.distanceTo(unit, a) - this.distanceTo(unit, b))[0] ?? null

    return nearestFriendlyTarget
  }

  private getPendingTargetIds(): uuid[] {
    const delivered = new Set(this.state.targetsDelivered ?? [])
    return this.state.targets.filter((id) => !delivered.has(id))
  }

  private hasUndeliveredTargets(): boolean {
    return this.getPendingTargetIds().length > 0
  }

  private hasDeliveredTargets(): boolean {
    return (this.state.targetsDelivered?.length ?? 0) > 0
  }

  private canDeliverAnyPendingTargetNow(unit: BaseUnit): boolean {
    const deliveryRange = this.getDeliveryRange()
    for (const id of this.getPendingTargetIds()) {
      const target = window.ROOM_WORLD.units.get(id)
      if (!target || !target.alive) continue
      if (this.distanceTo(unit, target) <= deliveryRange) {
        return true
      }
    }
    return false
  }

  private tryHandleReachedTarget(
    unit: BaseUnit,
    visibleTarget: BaseUnit | null,
    deliveryTarget: BaseUnit | null,
  ): boolean {
    if (!deliveryTarget) return false
    const deliveryRange = this.getDeliveryRange()
    if (this.distanceTo(unit, deliveryTarget) > deliveryRange) return false
    if (this.state.returning) {
      this.finishReturn(unit)
      return true
    }
    if (!this.state.returning && !visibleTarget && this.state.manualRoutePoints?.length) {
      if ((this.state.routeIndex ?? 0) < (this.state.route?.length ?? 0)) {
        this.ensureDeliveryMoveCommands(unit)
        return true
      }
    }
    this.deliverToTarget(unit)
    this.state.deliveryTargetId = null
    this.removePendingDeliveryMoves(unit)
    if (this.hasUndeliveredTargets()) {
      this.emitDeliveryStatus('in_transit')
      if (this.state.manualRoutePoints?.length) {
        this.syncRouteIndexToNearest(unit)
        return true
      }
      this.ensureDeliveryMoveCommands(unit)
      return true
    }
    const returnTarget = this.resolveReturnTarget(unit)
    const hasReturnTarget = Boolean(returnTarget)
    if (this.shouldReturnAfterSuccessfulDelivery() || hasReturnTarget) {
      if (returnTarget && this.distanceTo(unit, returnTarget) <= deliveryRange) {
        this.finishReturn(unit)
        return true
      }
      this.startReturning(unit, null, 'delivered')
      return true
    }
    this.finishReturn(unit)
    return true
  }

  private syncRouteIndexToNearest(unit: BaseUnit) {
    if (!this.state.route?.length) return
    const nearestIdx = this.findNearestRouteIndex(unit.pos, this.state.route)
    if (nearestIdx < 0) return
    this.state.routeIndex = nearestIdx
  }

  private syncReturnRouteIndexToNearest(unit: BaseUnit) {
    if (!this.state.returnRoute?.length) return
    const nearestIdx = this.findNearestRouteIndex(unit.pos, this.state.returnRoute)
    if (nearestIdx < 0) return
    this.state.returnRouteIndex = nearestIdx
  }

  private markTargetDelivered(id: uuid) {
    if (!this.state.targetsDelivered) {
      this.state.targetsDelivered = []
    }
    if (!this.state.targetsDelivered.includes(id)) {
      this.state.targetsDelivered.push(id)
    }
  }

  private unitHasActiveAttackCommand(unit: BaseUnit): boolean {
    return unit.getCommands().some((command) => (
      command.type === UnitCommandTypes.Attack
      && !command.isFinished(unit)
    ))
  }

  private rememberAttackedTarget(id: uuid) {
    if (!this.state.attackedTargets) {
      this.state.attackedTargets = []
    }
    if (!this.state.attackedTargets.includes(id)) {
      this.state.attackedTargets.push(id)
    }
  }

  private buildUnitTagsList(ids: uuid[]): string {
    const uniqueIds = Array.from(new Set(ids))
    return uniqueIds
      .map((id) => `#unit.${id}#`)
      .join(' ')
  }

  private startReturning(
    unit: BaseUnit,
    reason: NonNullable<DeliveryCommandState['returnReason']> | null,
    status: 'failed' | 'delivered' = 'failed'
  ) {
    this.state.returnReason = reason
    this.state.returning = true
    this.state.deliveryStatus = status
    this.state.rerouteEnemySignature = null
    this.clearAutoRouteCache()
    const returnTarget = this.resolveReturnTarget(unit)
    if (returnTarget) {
      this.state.deliveryTargetId = returnTarget.id
    }
    this.state.returnRouteIndex = 0
    this.state.returnRoute = this.buildReturnRouteFromCurrentPosition(unit)
    this.logPerf('start_returning', {
      reason,
      status,
      returnRoutePoints: this.state.returnRoute.length,
      tracePoints: this.state.outboundTrace?.length ?? 0,
      hasReturnTarget: Boolean(returnTarget),
    })
    this.removePendingDeliveryMoves(unit)
  }

  private resolveVisibleTarget(unit: BaseUnit): BaseUnit | null {
    const sourceTargets = this.state.returning
      ? []
      : this.getPendingTargetIds()
    const targetUnitsAll = sourceTargets
      .map((id) => window.ROOM_WORLD.units.get(id))
      .filter((u): u is BaseUnit => Boolean(u && u.alive))
    if (!targetUnitsAll.length) return null

    const targetUnits = this.state.returning
      ? targetUnitsAll
      : [
        ...targetUnitsAll.filter((u) => u.type !== unitType.GENERAL && u.id !== this.state.sourceUnitId),
        ...targetUnitsAll.filter((u) => u.type === unitType.GENERAL),
      ]

    const visionPx = unit.visionRange / window.ROOM_WORLD.map.metersPerPixel
    for (const target of targetUnits) {
      const dx = target.pos.x - unit.pos.x
      const dy = target.pos.y - unit.pos.y
      if ((dx * dx + dy * dy) <= visionPx * visionPx) {
        return target
      }
    }
    return null
  }

  private ensureDeliveryMoveCommands(unit: BaseUnit): boolean {
    if (this.state.delivered) return false;
    if (this.hasPendingRegularMove(unit)) return false;
    const visibleTarget = this.resolveVisibleTarget(unit);
    const deliveryTarget = visibleTarget ?? this.resolveDeliveryTarget(unit);
    if (!deliveryTarget) {
      if (this.state.returning) {
        this.state.delivered = true;
      } else if (this.hasDeliveredTargets()) {
        this.startReturning(unit, null, 'delivered')
      } else {
        this.startReturning(unit, 'target_not_found')
      }
      return false;
    }

    if (this.distanceTo(unit, deliveryTarget) <= this.getDeliveryRange()) {
      return false;
    }
    if (this.hasPendingDeliveryMove(unit)) {
      return false;
    }

    let routePoints: vec2[] = []
    if (this.state.returning && this.state.returnRoute?.length) {
      const returnIdx = this.state.returnRouteIndex ?? 0
      const rawPendingWaypoints = this.state.returnRoute.slice(returnIdx)
      const pendingWaypoints = this.pruneIntermediateThreatenedWaypoints(rawPendingWaypoints)
      this.logPerf('prepare_return_route_points', {
        returnIdx,
        rawWaypoints: rawPendingWaypoints.length,
        waypointsAfterPrune: pendingWaypoints.length,
      })
      if (pendingWaypoints.length > 0) {
        routePoints = this.buildDirectRouteFromWaypoints(unit.pos, pendingWaypoints)
        this.logPerf('return_route_direct', {
          routePoints: routePoints.length,
        })
        if (!routePoints.length) {
          this.logPerf('return_route_direct_empty_fallback_astar', {
            pendingWaypoints: pendingWaypoints.length,
          })
          routePoints = this.buildRouteThroughWaypoints(unit.pos, pendingWaypoints)
        }
        this.state.returnRouteIndex = this.state.returnRoute.length
      }
    } else if (!visibleTarget && !this.state.returning && this.state.manualRoutePoints?.length) {
      if (!this.state.route?.length) {
        if (this.state.manualRouteIsPath) {
          this.state.route = this.state.manualRoutePoints.map((point) => ({ x: point.x, y: point.y }))
        } else {
          this.state.route = buildMessengerRouteByNearestPoints(unit.pos, this.state.manualRoutePoints)
        }
        this.state.routeKind = 'manual'
        this.state.routeTargetId = null
        this.state.routeThreatSignature = null
        this.state.routeIndex = 0
      }
      const idx = this.state.routeIndex ?? 0
      const pendingWaypoints = this.state.route.slice(idx)
      if (pendingWaypoints.length > 0) {
        routePoints = this.buildRouteThroughWaypoints(unit.pos, pendingWaypoints)
        this.state.routeIndex = this.state.route.length
      }
    } else if (!visibleTarget && !this.state.returning && this.state.route?.length && this.state.routeKind === 'auto') {
      const currentThreatSignature = this.getThreatSignature()
      const canReuseAutoRoute = this.state.routeTargetId === deliveryTarget.id
        && this.state.routeThreatSignature === currentThreatSignature
      if (canReuseAutoRoute) {
        const nearestIdx = this.findNearestRouteIndex(unit.pos, this.state.route)
        if (nearestIdx >= 0) {
          const pendingWaypoints = this.pruneIntermediateThreatenedWaypoints(
            this.state.route.slice(nearestIdx)
          )
          routePoints = this.buildDirectRouteFromWaypoints(unit.pos, pendingWaypoints)
          this.logPerf('auto_route_reuse', {
            nearestIdx,
            pendingWaypoints: pendingWaypoints.length,
            routePoints: routePoints.length,
          })
        }
      } else {
        this.logPerf('auto_route_cache_miss', {
          targetChanged: this.state.routeTargetId !== deliveryTarget.id,
          threatChanged: this.state.routeThreatSignature !== currentThreatSignature,
        })
        this.clearAutoRouteCache()
      }
    }
    if (!routePoints.length) {
      this.logPerf('fallback_target_route_astar', {
        visibleTarget: Boolean(visibleTarget),
        returning: Boolean(this.state.returning),
      })
      routePoints = this.buildDeliveryRoute(deliveryTarget.pos, unit.pos);
      if (!visibleTarget && !this.state.returning && routePoints.length) {
        this.state.route = routePoints.map((point) => ({ x: point.x, y: point.y }))
        this.state.routeIndex = 0
        this.state.routeKind = 'auto'
        this.state.routeTargetId = deliveryTarget.id
        this.state.routeThreatSignature = this.getThreatSignature()
        this.logPerf('auto_route_cached', {
          routePoints: this.state.route.length,
          targetId: this.state.routeTargetId,
        })
      }
    }
    const uniqueId = crypto.randomUUID();
    const currentCommands = unit.getCommands();
    const routeCommands = routePoints.map((point, segIndex) => new MoveCommand({
      target: {
        x: point.x,
        y: point.y,
      },
      modifier: null,
      comment: DeliveryCommand.DELIVERY_MOVE_COMMENT,
      abilities: [],
      orderIndex: 0,
      uniqueId,
      segIndex,
      isPatrol: false,
    }));

    unit.setCommands([...currentCommands, ...routeCommands]);
    return true;
  }

  private deliverToTarget(unit: BaseUnit, ignoreRange = false) {
    const deliveryRange = this.getDeliveryRange()
    let deliveredAny = false
    for (const id of this.getPendingTargetIds()) {
      const u = window.ROOM_WORLD.units.get(id);
      if (!u) continue;
      if (!ignoreRange && this.distanceTo(unit, u) > deliveryRange) continue;
      for (const m of unit.messages) {
        window.ROOM_WORLD.units.withNewCommandsTmp.add(id);
        u.linkMessage(m.id);
        applyReadyMessageOrdersToUnit(window.ROOM_WORLD.messages.get(m.id), u);
        u.setDirty();
        deliveredAny = true
      }
      if (this.unitHasActiveAttackCommand(u)) {
        this.rememberAttackedTarget(id)
      }
      this.markTargetDelivered(id)
    }
    if (deliveredAny) {
      this.emitDeliveryStatus('delivered')
    }
  }

  private finishReturn(unit: BaseUnit) {
    if (this.state.returnReason) {
      this.sendReportIfNeeded(unit, this.state.returnReason)
    } else {
      this.sendSuccessReportIfNeeded(unit)
    }
    this.applyReturnHpDeltaIfNeeded()
    this.state.delivered = true;
    window.ROOM_WORLD.units.remove(unit.id);
  }

  update(unit: BaseUnit, dt: number) {
    void dt;
    this.applySpawnHpDeltaIfNeeded()
    if (this.state.delivered) return;
    this.rememberOutboundTracePoint(unit.pos)
    const visibleEnemies = this.resolveEnemiesThatCanSeeUnit(unit)
    this.rememberEnemySightings(visibleEnemies)
    const immediateVisibleTarget = this.resolveVisibleTarget(unit)
    const immediateDeliveryTarget = immediateVisibleTarget ?? this.resolveDeliveryTarget(unit)
    if (this.tryHandleReachedTarget(unit, immediateVisibleTarget, immediateDeliveryTarget)) return
    if (this.rerouteAfterEnemySpotted(unit, visibleEnemies)) return
    if (
      !this.state.returning
      && !this.isUmpireReportDelivery()
      && this.isVisibleForEnemy(unit)
      && !this.canDeliverAnyPendingTargetNow(unit)
    ) {
      this.startReturning(unit, 'enemy_spotted', 'failed')
      this.emitDeliveryStatus('failed')
      this.ensureDeliveryMoveCommands(unit)
      return
    }
    if (this.maybeInterceptedByEnemy(unit)) return

    if (this.state.instantDelivery) {
      this.deliverToTarget(unit, true);
      this.finishReturn(unit);
      return;
    }

    const visibleTarget = this.resolveVisibleTarget(unit)
    if (visibleTarget && visibleTarget.id !== this.state.deliveryTargetId) {
      this.clearAutoRouteCache()
      this.syncRouteIndexToNearest(unit)
      this.state.deliveryTargetId = visibleTarget.id
      this.removePendingDeliveryMoves(unit)
    }
    if (
      visibleTarget
      && this.distanceTo(unit, visibleTarget) > this.getDeliveryRange()
      && this.hasPendingDeliveryMove(unit)
    ) {
      // Visible targets have priority over the previously planned path.
      this.syncRouteIndexToNearest(unit)
      this.removePendingDeliveryMoves(unit)
    }
    if (!this.state.returning && this.state.manualRoutePoints?.length && !visibleTarget) {
      if (!this.state.route?.length) {
        if (this.state.manualRouteIsPath) {
          this.state.route = this.state.manualRoutePoints.map((point) => ({ x: point.x, y: point.y }))
        } else {
          this.state.route = buildMessengerRouteByNearestPoints(unit.pos, this.state.manualRoutePoints)
        }
        this.state.routeIndex = 0
      }
      const nextIdx = this.state.routeIndex ?? 0
      if (nextIdx < (this.state.route?.length ?? 0) || this.hasPendingDeliveryMove(unit)) {
        this.emitDeliveryStatus('in_transit')
        this.ensureDeliveryMoveCommands(unit)
        return
      }
      if (this.hasDeliveredTargets()) {
        this.startReturning(unit, null, 'delivered')
      } else {
        this.startReturning(unit, 'target_not_found', 'failed')
      }
      return
    }
    const deliveryTarget = visibleTarget ?? this.resolveDeliveryTarget(unit);
    if (!deliveryTarget) {
      if (!this.state.returning) {
        if (this.hasDeliveredTargets()) {
          this.startReturning(unit, null, 'delivered')
        } else {
          this.startReturning(unit, 'target_not_found', 'failed')
        }
      } else {
        this.state.delivered = true;
      }
      return;
    }
    if (this.tryHandleReachedTarget(unit, visibleTarget, deliveryTarget)) return

    this.emitDeliveryStatus('in_transit')
    this.ensureDeliveryMoveCommands(unit);
  }

  isFinished(): boolean {
    return Boolean(this.state.delivered)
  }

  estimate(unit: BaseUnit): number {
    if (this.state.delivered) return 0;

    const deliveryTarget = this.resolveDeliveryTarget(unit);
    if (!deliveryTarget) return 0;

    const distPx = this.distanceTo(unit, deliveryTarget);
    const remainPx = Math.max(0, distPx - this.getDeliveryRange());
    if (remainPx <= 0) return 0;

    const speedMetersPerSecond = unit.speed / 60;
    if (!Number.isFinite(speedMetersPerSecond) || speedMetersPerSecond <= 0) return Infinity;
    return Math.ceil(remainPx * window.ROOM_WORLD.map.metersPerPixel / speedMetersPerSecond);
  }

  getState() {
    return {
      type: this.type,
      status: this.status,
      state: this.state,
    }
  }
}
