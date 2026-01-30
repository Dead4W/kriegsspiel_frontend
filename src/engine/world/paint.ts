import type {PaintStroke} from "@/engine/types/paintTypes.ts";

export class paintstate {
  private strokes: PaintStroke[] = []
  private version = 0

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
    this.touch()
  }

  add(stroke: PaintStroke) {
    // Avoid duplicates when the same stroke arrives twice (e.g. local + echoed).
    if (this.strokes.some(s => s.id === stroke.id)) return
    this.strokes.push(stroke)
    this.touch()
  }

  removeById(id: string) {
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
        this.touch()
        return removed
      }
    }
    return undefined
  }

  undo() {
    const removed = this.strokes.pop()
    if (removed) this.touch()
    return removed
  }
}

