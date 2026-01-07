export type unsub = () => void

export class emitter<T extends Record<string, any>> {
  private listeners = new Map<keyof T, Set<(payload: any) => void>>()

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

  async emit<K extends keyof T>(event: K, payload: T[K]) {
    const set = this.listeners.get(event)
    if (!set) return

    // копия — защита от mutation во время emit
    for (const fn of [...set]) {
      (fn as any)(payload)
    }
  }
}
