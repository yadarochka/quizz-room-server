require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const passport = require('passport');

const { initDb } = require('./src/config/database');
require('./src/config/passport');
const authRoutes = require('./src/routes/auth');
const quizRoutes = require('./src/routes/quizzes');
const sessionRoutes = require('./src/routes/sessions');
const { authMiddleware, getUserFromCookieHeader } = require('./src/middleware/auth');
const { errorHandler } = require('./src/middleware/errorHandler');
const { registerSocketHandlers } = require('./src/events/socketHandlers');

const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

async function bootstrap() {
  await initDb();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: CLIENT_URL,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  app.use(helmet());
  app.use(cors({
    origin: CLIENT_URL,
    credentials: true
  }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(passport.initialize());

  app.use('/auth', authRoutes);
  app.use('/api/quizzes', authMiddleware.optional, quizRoutes);
  app.use('/api/sessions', authMiddleware.optional, sessionRoutes);

  app.use(errorHandler);

  io.on('connection', (socket) => {
    const cookieHeader = socket.handshake.headers.cookie || '';
    const user = getUserFromCookieHeader(cookieHeader);
    registerSocketHandlers(io, socket, user);
  });

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', err);
  process.exit(1);
});


