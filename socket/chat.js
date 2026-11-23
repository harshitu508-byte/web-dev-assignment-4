const jwt = require('jsonwebtoken');
const {
  MAX_ROOMS_PER_SOCKET, validateRoom, validateMessage, createRateLimiter,
} = require('./validators');

const asObject = (p) => (p && typeof p === 'object' ? p : {});

module.exports = function initChat(io) {
  // Authenticate every socket connection with the same JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    const allowMessage = createRateLimiter(5, 10_000); // 5 messages / 10 s
    const allowTyping = createRateLimiter(10, 5_000);  // 10 typing events / 5 s
    const reject = (event, message) => socket.emit('chatError', { event, message });

    socket.on('joinRoom', (room = 'general') => {
      if (!validateRoom(room)) {
        return reject('joinRoom', 'Invalid room name (1-30 chars: letters, numbers, - or _)');
      }
      if (socket.rooms.has(room)) return;
      if (socket.rooms.size - 1 >= MAX_ROOMS_PER_SOCKET) { // socket.rooms includes its own id
        return reject('joinRoom', `You can join at most ${MAX_ROOMS_PER_SOCKET} rooms`);
      }
      socket.join(room);
      console.log(`${socket.id} joined room ${room}`);
      io.to(room).emit('system', { room, message: `${socket.user.username} joined ${room}` });
    });

    socket.on('chatMessage', (payload) => {
      const { room = 'general', message } = asObject(payload);
      if (!allowMessage()) return reject('chatMessage', 'Too many messages, slow down');
      if (!validateRoom(room)) return reject('chatMessage', 'Invalid room name');
      if (!socket.rooms.has(room)) return reject('chatMessage', 'Join the room before sending messages');

      const result = validateMessage(message);
      if (!result.ok) return reject('chatMessage', result.error);

      const out = { room, user: socket.user.username, message: result.value, time: new Date().toISOString() };
      console.log(`[${room}] ${out.user}: ${out.message}`);
      io.to(room).emit('chatMessage', out);
    });

    socket.on('typing', (payload) => {
      const { room = 'general' } = asObject(payload);
      // Silently ignore bad rooms, non-members and floods
      if (!validateRoom(room) || !socket.rooms.has(room) || !allowTyping()) return;
      socket.to(room).emit('typing', { room, user: socket.user.username });
    });

    socket.on('disconnect', () => console.log(`User disconnected: ${socket.id}`));
  });
};
