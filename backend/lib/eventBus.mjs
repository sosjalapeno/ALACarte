import { EventEmitter } from 'node:events'

const bus = new EventEmitter()
bus.setMaxListeners(100)

export function emitEvent(type, data) {
  bus.emit('event', { type, data, ts: Date.now() })
}

export function onEvent(listener) {
  bus.on('event', listener)
  return () => bus.off('event', listener)
}
