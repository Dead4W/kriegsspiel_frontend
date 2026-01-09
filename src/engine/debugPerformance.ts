import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";

type PerfStats = {
  calls: number
  selfTime: number
  totalTime: number
  min: number
  max: number
}

type PerfNode = {
  name: string
  stats?: PerfStats
  children: Map<string, PerfNode>
}

const root: PerfNode = { name: 'root', children: new Map() }
const stack: {
  node: PerfNode
  start: number
  childTime: number
}[] = []

const LOG_INTERVAL = 1000
let started = false

/* ---------------------------------- */
/* Logger                              */
/* ---------------------------------- */

function startLogger() {
  if (started) return
  started = true

  setInterval(() => {
    if (root.children.size === 0) return

    console.groupCollapsed(
      `%c[Perf] tree`,
      'color:#4caf50;font-weight:bold'
    )

    printTree(root)

    root.children.clear()

    console.groupEnd()
  }, LOG_INTERVAL)
}

/* ---------------------------------- */
/* Public API                          */
/* ---------------------------------- */

export function debugPerformance<T>(
  name: string,
  fn: () => T | Promise<T>
): T | Promise<T> {
  if (!window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.ENABLE_PERFORMANCE_DEBUG]) {
    const result = fn()
    if (result instanceof Promise) {
      return result.finally(() => finish(frame))
    }
    return result
  }

  startLogger()

  const parent = stack[stack.length - 1]

  let node: PerfNode
  if (parent) {
    node = parent.node.children.get(name)!
    if (!node) {
      node = { name, children: new Map() }
      parent.node.children.set(name, node)
    }
  } else {
    node = root.children.get(name)!
    if (!node) {
      node = { name, children: new Map() }
      root.children.set(name, node)
    }
  }

  const frame = {
    node,
    start: performance.now(),
    childTime: 0,
  }

  stack.push(frame)

  try {
    const result = fn()

    if (result instanceof Promise) {
      return result.finally(() => finish(frame))
    }

    finish(frame)
    return result
  } catch (e) {
    finish(frame)
    throw e
  }
}

/* ---------------------------------- */
/* Internals                           */
/* ---------------------------------- */

function finish(frame: typeof stack[number]) {
  const duration = performance.now() - frame.start
  const selfTime = duration - frame.childTime

  let s = frame.node.stats
  if (!s) {
    s = {
      calls: 0,
      selfTime: 0,
      totalTime: 0,
      min: Infinity,
      max: 0,
    }
    frame.node.stats = s
  }

  s.calls++
  s.selfTime += selfTime
  s.totalTime += duration
  s.min = Math.min(s.min, duration)
  s.max = Math.max(s.max, duration)

  stack.pop()

  // добавляем время родителю
  const parent = stack[stack.length - 1]
  if (parent) {
    parent.childTime += duration
  }
}

function printTree(node: PerfNode, depth = 0) {
  if (node.name !== 'root' && node.stats) {
    const s = node.stats
    const avg = s.totalTime / s.calls
    const indent = '  '.repeat(depth)

    console.log(
      `%c${indent}${node.name}`,
      'color:#03a9f4',
      {
        calls: s.calls,
        self: `${s.selfTime.toFixed(2)} ms`,
        total: `${s.totalTime.toFixed(2)} ms`,
        avg: `${avg.toFixed(2)} ms`,
      }
    )
  }

  for (const child of node.children.values()) {
    printTree(child, depth + 1)
  }
}
