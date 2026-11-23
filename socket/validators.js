const ROOM_PATTERN = /^[A-Za-z0-9_-]{1,30}$/;
const MAX_MESSAGE_LENGTH = 500;
const MAX_ROOMS_PER_SOCKET = 5;

const validateRoom = (room) => typeof room === 'string' && ROOM_PATTERN.test(room);

function validateMessage(message) {
  if (typeof message !== 'string') return { ok: false, error: 'Message must be text' };
  if (message.length > MAX_MESSAGE_LENGTH * 2) {
    return { ok: false, error: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters` };
  }
  // Replace control characters (stops forged log lines) then trim
  const value = message.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (!value) return { ok: false, error: 'Message cannot be empty' };
  if (value.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters` };
  }
  return { ok: true, value };
}

// Sliding-window limiter: allows `limit` calls per `windowMs`. One instance per socket.
function createRateLimiter(limit, windowMs) {
  let stamps = [];
  return function allow(now = Date.now()) {
    stamps = stamps.filter((t) => now - t < windowMs);
    if (stamps.length >= limit) return false;
    stamps.push(now);
    return true;
  };
}

module.exports = {
  ROOM_PATTERN, MAX_MESSAGE_LENGTH, MAX_ROOMS_PER_SOCKET,
  validateRoom, validateMessage, createRateLimiter,
};
