import type { unsub } from '@/engine/events'

type Teardown = unsub

/**
 * Aggregates input-related listeners/subscriptions so switching input backends
 * (2D/3D/etc.) can mount/unmount handlers in one place.
 */
export class InputLifecycle {
  private teardowns: Teardown[] = []
  private active = true

  add(teardown: Teardown | null | undefined) {
    if (!teardown) return
    if (!this.active) {
      teardown()
      return
    }
    this.teardowns.push(teardown)
  }

  listen<T extends EventTarget, K extends string>(
    target: T,
    type: K,
    listener: (event: any) => void,
    options?: boolean | AddEventListenerOptions
  ) {
    const eventListener = listener as EventListener
    target.addEventListener(type, eventListener, options)
    this.add(() => target.removeEventListener(type, eventListener, options))
  }

  dispose() {
    if (!this.active) return
    this.active = false

    for (let i = this.teardowns.length - 1; i >= 0; i--) {
      this.teardowns[i]!()
    }
    this.teardowns.length = 0
  }
}

