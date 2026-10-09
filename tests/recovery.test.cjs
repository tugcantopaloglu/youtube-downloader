const assert = require('node:assert/strict')
const test = require('node:test')
const { failureKind, recoveryPlan } = require('../electron/recovery.cjs')

test('queue recovery distinguishes permanent failures from retries', () => {
  const cases = [
    [{ message: 'HTTP Error 429: Too Many Requests' }, 'rate-limit'],
    [{ message: 'HTTP Error 403: Forbidden' }, 'forbidden'],
    [{ code: 'ECONNRESET', message: 'connection reset' }, 'connection'],
    [{ code: 'ENOSPC', message: 'disk full' }, 'storage'],
    [{ code: 'AUTH_REQUIRED', message: 'authentication required' }, 'authentication'],
    [{ code: 'INVALID_MEDIA', message: 'invalid output' }, 'permanent'],
    [{ message: 'private video' }, 'permanent']
  ]
  for (const [error, expected] of cases) assert.equal(failureKind(error), expected)
  assert.equal(recoveryPlan('connection', 1).delay, 30000)
  assert.equal(recoveryPlan('connection', 3).delay, 300000)
  assert.equal(recoveryPlan('connection', 4).delay, 0)
  assert.equal(recoveryPlan('rate-limit', 3).delay, 3600000)
  assert.equal(recoveryPlan('rate-limit', 4).delay, 0)
  assert.equal(recoveryPlan('forbidden', 2).delay, 0)
})
