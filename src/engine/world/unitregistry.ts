import type { uuid, unitstate } from '@/engine/units/types'
import type {BaseUnit} from '@/engine/units/baseUnit'
import { createUnit } from '@/engine/units'
import type {MoveFrame, vec2} from "@/engine/types.ts";

export type UnitDirtyObject = {
  unit: unitstate,
  frames: MoveFrame[],
}

export class unitregistry {
  private map = new Map<uuid, BaseUnit>()
  private dirty = new Set<uuid>()
  private dirtyRemove = new Set<uuid>()
  private dirtyMoveFrames = new Map<uuid, MoveFrame[]>()


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
    return [...this.map.values()].filter(u => u.selected && u.alive)
  }

  pickAt(pos: vec2, radius = 15): BaseUnit | null {
    const units = Array.from(this.map.values())
      .filter(u => u.alive)
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

  selectInRect(a: vec2, b: vec2, isPreview: boolean) {
    const minX = Math.min(a.x, b.x)
    const maxX = Math.max(a.x, b.x)
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y, b.y)

    for (const u of this.map.values()) {
      if (!u.alive) continue;

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
}
