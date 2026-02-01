import {type unitstate, type unitTeam, unitType, type uuid} from '@/engine/units/types'
import type {BaseUnit} from '@/engine/units/baseUnit'
import {createUnit} from '@/engine/units'
import type {MoveFrame, vec2} from "@/engine/types.ts";
import {buildVisionPolygon, pointInPolygon} from "@/engine/render/unitlayer/visionlayer.ts";
import {Team} from "@/enums/teamKeys.ts";
import {RoomGameStage} from "@/enums/roomStage.ts";

export type UnitDirtyObject = {
  unit: unitstate,
  frames: MoveFrame[],
}

export class unitregistry {
  private map = new Map<uuid, BaseUnit>()
  private dirty = new Set<uuid>()
  private dirtyRemove = new Set<uuid>()
  private dirtyMoveFrames = new Map<uuid, MoveFrame[]>()
  public withNewCommandsTmp = new Set<uuid>()
  public withNewCommands = new Set<uuid>()


  upsert(state: unitstate, source: 'local' | 'remote' = 'local'): BaseUnit {
    const existing = this.map.get(state.id)
    if (existing) {
      Object.assign(existing, state)
      return existing
    }

    if (source == 'local') {
      this.dirty.add(state.id)
    }
    const u = createUnit(state)
    this.map.set(u.id, u)
    return u
  }

  addUnitDirty(id: uuid) {
    this.dirty.add(id);
  }

  getDirty(): UnitDirtyObject[] {
    const list: UnitDirtyObject[] = []
    for (const id of this.dirty) {
      const u = this.get(id);
      if (u) {
        const moveFrames = this.dirtyMoveFrames.get(id) ?? [];
        if (moveFrames.length > 0) {
          moveFrames.push({
            t: moveFrames[moveFrames.length-1]!.t + 1,
            pos: u.pos,
          });
        }
        list.push({
          unit: u.toState(),
          frames: moveFrames,
        });
        u.isDirty = false;
      }
    }
    this.dirty.clear();
    this.dirtyMoveFrames.clear()

    return list;
  }

  addDirtyMove(id: uuid, frame: MoveFrame) {
    let list = this.dirtyMoveFrames.get(id)
    if (!list) {
      list = []
      this.dirtyMoveFrames.set(id, list)
    }
    list.push(frame)
  }

  getDirtyRemove(): uuid[] {
    const values = [...this.dirtyRemove.values()]
    this.dirtyRemove.clear()
    return values;
  }

  remove(id: uuid, source: 'local' | 'remote' = 'local') {
    // const u = this.get(id)!;
    // if (
    //   source === 'local'
    //   && window.ROOM_WORLD.stage !== RoomGameStage.PLANNING
    //   && window.PLAYER.team !== Team.ADMIN
    //   && u.team === window.PLAYER.team
    // ) {
    //   return;
    // }
    this.map.delete(id)
    if (source === 'local') this.dirtyRemove.add(id)
  }

  list(): BaseUnit[] {
    return [...this.map.values()]
  }

  get(id: uuid): BaseUnit | null {
    return this.map.get(id) ?? null
  }

  clearSelection() {
    for (const u of this.map.values()) {
      u.selected = false
    }
  }

  getSelected(): BaseUnit[] {
    return [...this.map.values()].filter(u => u.selected)
  }

  pickAt(pos: vec2, radius = 15): BaseUnit | null {
    const units = Array.from(this.map.values())
      .sort((a, b) => b.lastSelected - a.lastSelected)

    for (let i = 0; i < units.length; i++) {
      const u = units[i] as BaseUnit

      const dx = u.pos.x - pos.x
      const dy = u.pos.y - pos.y
      if (dx * dx + dy * dy <= radius * radius) {
        u.lastSelected = performance.now();
        return u
      }
    }

    return null
  }

  select(u: BaseUnit): void {
    u.selected = true
    u.lastSelected = performance.now();
  }

  selectInRect(a: vec2, b: vec2, isPreview: boolean) {
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y, b.y)

    for (const u of this.map.values()) {
      let isSelected = u.pos.x >= minX &&
        u.pos.x <= maxX &&
        u.pos.y >= minY &&
        u.pos.y <= maxY;
      u.lastSelected = performance.now()
      if (isPreview) {
        u.previewSelected = isSelected;
      } else {
        u.selected = isSelected;
      }
    }
  }

  getDirectViewByGenerals(): Map<unitTeam, uuid[]> {
    const directViewByTeam = new Map<unitTeam, uuid[]>();
    directViewByTeam.set(Team.RED, [])
    directViewByTeam.set(Team.BLUE, [])

    for (const generalUnit of this.list()) {
      if (generalUnit.team !== Team.RED && generalUnit.team !== Team.BLUE) continue;
      if (generalUnit.type !== unitType.GENERAL) continue;
      generalUnit.directView = true;

      const visionUnits = this.getDirectView(generalUnit)
      directViewByTeam
        .get(generalUnit.team)!
        .push(...visionUnits.map(v => v.id));
      directViewByTeam
        .get(generalUnit.team)!
        .push(generalUnit.id)
    }

    return directViewByTeam;
  }

  getDirectView(unit: BaseUnit): BaseUnit[] {
    const result = []
    const visionPoly = buildVisionPolygon(unit, window.ROOM_WORLD)
    for (const u of this.list()) {
      if (u.id === unit.id) continue
      const a = unit.pos
      const b = u.pos
      const d = Math.hypot(b.x - a.x, b.y - a.y);

      if (d > unit.visionRange / window.ROOM_WORLD.map.metersPerPixel) continue;

      if (pointInPolygon(unit.pos, visionPoly)) {
        result.push(u)
      }
    }
    return result
  }
}
