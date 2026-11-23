// Event-driven features using Node.js EventEmitter
const EventEmitter = require('events');

class AppEvents extends EventEmitter {}
const appEvents = new AppEvents();

appEvents.on('user:registered', (user) =>
  console.log(`[event] user:registered -> ${user.username} (${user.email})`)
);
appEvents.on('user:login', (user) =>
  console.log(`[event] user:login -> ${user.username} at ${new Date().toISOString()}`)
);
appEvents.on('login:failed', (email) =>
  console.warn(`[event] login:failed -> ${email}`)
);
appEvents.on('note:created', (note) =>
  console.log(`[event] note:created -> "${note.title}" by ${note.owner}`)
);
appEvents.on('note:updated', (note) =>
  console.log(`[event] note:updated -> "${note.title}"`)
);
appEvents.on('note:deleted', (id) =>
  console.log(`[event] note:deleted -> ${id}`)
);

module.exports = appEvents;
