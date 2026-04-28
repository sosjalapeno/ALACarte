import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emitEvent, onEvent } from '../lib/eventBus.mjs'

test('onEvent receives a single envelope listener and emitEvent wraps {type, data, ts}', () => {
  const received = []
  const off = onEvent((evt) => received.push(evt))
  emitEvent('job.update', { id: 'a', status: 'done' })
  emitEvent('wrapper.stall.suspected', { jobId: 'a', idleMs: 65000 })
  off()
  emitEvent('job.update', { id: 'should-not-be-received' })

  assert.equal(received.length, 2)
  assert.equal(received[0].type, 'job.update')
  assert.deepEqual(received[0].data, { id: 'a', status: 'done' })
  assert.equal(typeof received[0].ts, 'number')
  assert.equal(received[1].type, 'wrapper.stall.suspected')
})

test('onEvent rejects the legacy two-arg form by throwing on string listener', () => {
  assert.throws(() => onEvent('job.update'), /listener|function/i)
})
