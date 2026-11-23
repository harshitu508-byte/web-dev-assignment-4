const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const app = require('./app');
const initChat = require('./socket/chat');

if (!process.env.JWT_SECRET) {
  console.error('[config] JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10 * 1024 }); // reject oversized socket payloads
initChat(io);

const PORT = process.env.PORT || 5000;
connectDB()
  .then(() => server.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('[db] connection failed:', err.message);
    process.exit(1);
  });
