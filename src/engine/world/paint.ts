import type {PaintStroke} from "@/engine/types/paintTypes.ts";

export class paintstate {
  private strokes: PaintStroke[] = []
  private version = 0
  private dirty = new Set<string>()
  /** Индекс последней отправленной точки для каждого штриха (для разбиения на сегменты) */
  private lastSentPointIndex = new Map<string, number>()

  getVersion() {
    return this.version
  }

  touch() {
    this.version++
  }

  list() {
    return this.strokes
  }

  clear() {
    this.strokes = []
    this.dirty.clear()
    this.lastSentPointIndex.clear()
    this.touch()
  }

  private pointCount(points: number[]) {
    return points.length >> 1
  }

  add(stroke: PaintStroke, source: 'local' | 'remote' = 'local') {
    const existing = this.strokes.find(s => s.id === stroke.id)
    if (existing) {
      if (stroke.points.length > existing.points.length) {
        existing.points = stroke.points
        this.touch()
        if (source === 'local') this.dirty.add(stroke.id)
      }
      return
    }
    this.strokes.push(stroke)
    this.touch()
    if (source === 'local') this.dirty.add(stroke.id)
  }

  markDirty(id: string) {
    if (this.strokes.some(s => s.id === id)) this.dirty.add(id)
  }

  getDirty(): PaintStroke[] {
    const list: PaintStroke[] = []
    for (const id of this.dirty) {
      const s = this.strokes.find(st => st.id === id)
      if (!s) continue
      const fromIdx = (this.lastSentPointIndex.get(id) ?? 0) << 1
      const points = s.points.slice(fromIdx)
      if (this.pointCount(points) < 2) continue
      const segment: PaintStroke = {
        ...s,
        id: crypto.randomUUID(),
        points,
      }
      list.push(segment)
      this.lastSentPointIndex.set(id, this.pointCount(s.points))
    }
    this.dirty.clear()
    return list
  }

  removeById(id: string) {
    this.dirty.delete(id)
    this.lastSentPointIndex.delete(id)
    const idx = this.strokes.findIndex(s => s.id === id)
    if (idx === -1) return undefined
    const [removed] = this.strokes.splice(idx, 1)
    this.touch()
    return removed
  }

  undoByOwner(ownerId: string) {
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      if (this.strokes[i]!.ownerId === ownerId) {
        const [removed] = this.strokes.splice(i, 1)
        if (removed) {
          this.dirty.delete(removed.id)
          this.lastSentPointIndex.delete(removed.id)
        }
        this.touch()
        return removed
      }
    }
    return undefined
  }

  undo() {
    const removed = this.strokes.pop()
    if (removed) {
      this.dirty.delete(removed.id)
      this.lastSentPointIndex.delete(removed.id)
      this.touch()
    }
    return removed
  }
}

