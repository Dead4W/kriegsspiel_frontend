// Node >= 22 exposes a `localStorage` global that stays `undefined` unless the
// process is started with `--localstorage-file`, and it shadows the jsdom one.
// Modules read `localStorage` at import time, so provide an in-memory store.
if (!globalThis.localStorage) {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryStorage,
  })
}

// jsdom has no canvas backend, while render modules build textures at import time.
if (typeof HTMLCanvasElement !== 'undefined') {
  const createContextStub = (): unknown =>
    new Proxy(
      {},
      {
        get: (target: Record<string, unknown>, prop: string) => {
          if (prop === 'canvas') return null
          if (!(prop in target)) {
            target[prop] = (...args: unknown[]) => (args.length ? createContextStub() : createContextStub())
          }
          return target[prop]
        },
      }
    )

  HTMLCanvasElement.prototype.getContext = (() => createContextStub()) as never
}
