export type unsub = () => void

export class emitter<T extends Record<string, any>> {
  private listeners = new Map<keyof T, Set<(payload: any) => void>>()
  private muted = new Map<keyof T, number>()

  on<K extends keyof T>(
    event: K,
    fn: (payload: T[K]) => void
  ): unsub {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }

    set.add(fn as any)

    // 🔹 unsubscribe
    return () => {
      set!.delete(fn as any)
      if (set!.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  off<K extends keyof T>(
    event: K,
    fn: (payload: T[K]) => void
  ): void {
    const set = this.listeners.get(event)
    if (!set) return

    set.delete(fn as any)

    if (set.size === 0) {
      this.listeners.delete(event)
    }
  }

  /**
   * Stops delivering an event until the returned function is called.
   *
   * Emissions in that window are dropped rather than queued: the caller is
   * saying they happened privately, not that they happened later. Used to run
   * the engine over a local-only copy of a situation without the result
   * escaping through anything listening.
   *
   * Nested mutes of the same event are counted, so releasing an inner one does
   * not reopen the outer.
   */
  mute<K extends keyof T>(event: K): unsub {
    this.muted.set(event, (this.muted.get(event) ?? 0) + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      const depth = (this.muted.get(event) ?? 1) - 1
      if (depth > 0) this.muted.set(event, depth)
      else this.muted.delete(event)
    }
  }

  isMuted<K extends keyof T>(event: K): boolean {
    return (this.muted.get(event) ?? 0) > 0
  }

  async emit<K extends keyof T>(event: K, payload: T[K]) {
    if (this.muted.has(event)) return
    const set = this.listeners.get(event)
    if (!set) return

    // копия — защита от mutation во время emit
    for (const fn of [...set]) {
      (fn as any)(payload)
    }
  }
}
