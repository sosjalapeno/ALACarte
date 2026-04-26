import os from 'node:os'

const MAX_CONCURRENCY = Math.max(1, Math.min(2, os.cpus().length - 1))

let active = 0
const queue = []

function pump() {
  while (active < MAX_CONCURRENCY && queue.length > 0) {
    const next = queue.shift()
    active += 1
    next()
  }
}

export async function withScryptSlot(fn) {
  await new Promise((resolve) => {
    queue.push(resolve)
    pump()
  })
  try {
    return await fn()
  } finally {
    active = Math.max(0, active - 1)
    pump()
  }
}
