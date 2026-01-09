import type {MoveFrame, unitstate, uuid, vec2} from "@/engine";
import {createRafInterval, interpolateMoveFrames, type RafInterval} from "@/engine/util.ts";

export type CursorObject = {
  name: string,
  frames: MoveFrame[],
  lastSeen: number,

  // runtime
  pos: vec2
  _timer?: RafInterval | null
  _startAt?: number
}

export class cursorregistry {
  private pos: vec2 = {x: 0, y: 0};
  private moveFrames: MoveFrame[] = [];
  private startMoveFrames = 0;
  private lastMoveAt = 0;
  private remoteCursors = new Map<string, CursorObject>();

  // Local cursor

  readonly CURSOR_FRAME_INTERVAL = 50 // мс

  setCurrentPos(pos: vec2) {
    const now = performance.now()

    this.pos = pos

    if (this.moveFrames.length === 0) {
      this.startMoveFrames = now
      this.lastMoveAt = now
    } else if (now - this.lastMoveAt < this.CURSOR_FRAME_INTERVAL) {
      return
    }

    this.lastMoveAt = now

    this.moveFrames.push({
      t: now - this.startMoveFrames,
      pos: { ...pos },
    })
  }

  getMoveFrames(): CursorObject | null {
    if (window.location.hostname === 'localhost') {
      return null
    }

    if (this.moveFrames.length === 0) {
      return null;
    }

    const obj: CursorObject = {
      name: window.PLAYER.name,
      frames: this.moveFrames,
      lastSeen: Date.now(),
      pos: this.moveFrames[0]!.pos,
    }

    this.moveFrames = []
    this.startMoveFrames = 0
    this.lastMoveAt = 0;

    return obj
  }

  // Remote cursors

  upsertRemoteCursor(data: CursorObject) {
    const existing = this.remoteCursors.get(data.name)

    if (existing?._timer) {
      existing._timer.stop()
    }

    data.frames = interpolateMoveFrames(data.frames)

    this.remoteCursors.set(data.name, data)
    this.startCursorAnimation(data)
  }

  getRemoteCursors(): CursorObject[] {
    return [...this.remoteCursors.values()]
  }

  // Animation remote cursor
  private startCursorAnimation(cursor: CursorObject) {
    cursor._startAt = performance.now()
    cursor._timer = createRafInterval(20, () => {
      this.playNextFrame(cursor)
    })
    cursor._timer.start()
  }

  private playNextFrame(cursor: CursorObject) {
    if (!cursor.frames.length) {
      cursor._timer?.stop()
      cursor._timer = null
      return
    }

    const now = performance.now()

    while (
      cursor.frames.length &&
      cursor.frames[0]!.t <= now - cursor._startAt!
    ) {
      const frame = cursor.frames.shift()!
      cursor.pos = frame.pos
    }

    window.ROOM_WORLD.events.emit('changed_overlay', { reason: 'remoteCursor' });
  }
}
