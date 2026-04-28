import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  AUTO_LIMITS,
  FIXED_INTERVAL_MS,
  autoIntervalMs,
  describeInterval,
  resolveIntervalMs,
} from '../lib/checkInterval.mjs'

test('fixed frequencies map to correct millisecond values', () => {
  assert.equal(resolveIntervalMs('1h', 0), FIXED_INTERVAL_MS['1h'])
  assert.equal(resolveIntervalMs('6h', 50), FIXED_INTERVAL_MS['6h'])
  assert.equal(resolveIntervalMs('12h', 999), FIXED_INTERVAL_MS['12h'])
  assert.equal(resolveIntervalMs('daily', 5), FIXED_INTERVAL_MS.daily)
  assert.equal(resolveIntervalMs('weekly', 5), FIXED_INTERVAL_MS.weekly)
})

test('auto frequency clamps to MIN at small followed counts', () => {
  assert.equal(autoIntervalMs(0), AUTO_LIMITS.MIN_AUTO_INTERVAL)
  assert.equal(autoIntervalMs(1), AUTO_LIMITS.MIN_AUTO_INTERVAL)
  assert.equal(autoIntervalMs(5), AUTO_LIMITS.MIN_AUTO_INTERVAL)
})

test('auto frequency scales linearly with followed count between clamps', () => {
  const fifty = autoIntervalMs(50)
  const hundred = autoIntervalMs(100)
  assert.ok(hundred > fifty, '100 artists should yield longer interval than 50')
  assert.ok(fifty > AUTO_LIMITS.MIN_AUTO_INTERVAL)
  assert.ok(hundred < AUTO_LIMITS.MAX_AUTO_INTERVAL)
  // expected ratio ~2x for 2x artists, plus clamping
  assert.ok(Math.abs(hundred - 2 * fifty) < fifty * 0.01 || hundred === AUTO_LIMITS.MAX_AUTO_INTERVAL)
})

test('auto frequency clamps to MAX for huge rosters', () => {
  assert.equal(autoIntervalMs(100000), AUTO_LIMITS.MAX_AUTO_INTERVAL)
})

test('describeInterval produces human-readable labels', () => {
  assert.match(describeInterval(30 * 60_000), /min/)
  assert.match(describeInterval(2 * 60 * 60_000), /h/)
  assert.match(describeInterval(3 * 24 * 60 * 60_000), /d/)
  assert.equal(describeInterval(Number.POSITIVE_INFINITY), 'manual only')
})
