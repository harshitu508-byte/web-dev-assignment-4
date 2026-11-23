const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateRoom, validateMessage, createRateLimiter, MAX_MESSAGE_LENGTH } = require('../socket/validators');

describe('chat: room validation', () => {
  it('accepts normal room names', () => {
    for (const r of ['general', 'team-1', 'dev_chat', 'A'.repeat(30)]) assert.equal(validateRoom(r), true);
  });
  it('rejects bad room names', () => {
    for (const r of ['', ' ', 'has space', '../etc', 'a'.repeat(31), 'room!', null, undefined, 42, {}, ['x']]) {
      assert.equal(validateRoom(r), false, `should reject ${JSON.stringify(r)}`);
    }
  });
});

describe('chat: message validation', () => {
  it('rejects empty and whitespace-only messages', () => {
    assert.equal(validateMessage('').ok, false);
    assert.equal(validateMessage('   \n\t ').ok, false);
  });
  it('rejects non-string messages', () => {
    for (const m of [undefined, null, 5, {}, []]) assert.equal(validateMessage(m).ok, false);
  });
  it('enforces the length limit', () => {
    assert.equal(validateMessage('a'.repeat(MAX_MESSAGE_LENGTH)).ok, true);
    assert.equal(validateMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1)).ok, false);
    assert.equal(validateMessage('a'.repeat(100000)).ok, false);
  });
  it('trims and strips control characters (no forged log lines)', () => {
    const r = validateMessage('  hi\n[general] Admin: pwned  ');
    assert.equal(r.ok, true);
    assert.ok(!/[\r\n]/.test(r.value));
    assert.ok(r.value.startsWith('hi'));
  });
});

describe('chat: rate limiter', () => {
  it('allows up to the limit, then blocks', () => {
    const allow = createRateLimiter(5, 10_000);
    for (let i = 0; i < 5; i++) assert.equal(allow(1000 + i), true);
    assert.equal(allow(1010), false);
  });
  it('allows again after the window passes', () => {
    const allow = createRateLimiter(2, 1000);
    assert.equal(allow(0), true);
    assert.equal(allow(10), true);
    assert.equal(allow(20), false);
    assert.equal(allow(1500), true);
  });
});
