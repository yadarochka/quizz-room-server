## Backend Quiz Server

Backend for a real-time quiz application with:

- REST API (quizzes, sessions, auth)
- WebSocket (Socket.io) for quiz rooms, questions, and answers
- Yandex OAuth + JWT in httpOnly cookies
- SQLite database

## Deploy

- API (Render): https://quizz-room-server.onrender.com
- Front (Netlify): https://quizzroom.netlify.app

### Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` in the project root based on:

```text
NODE_ENV=development
PORT=3000

# Yandex OAuth
YANDEX_CLIENT_ID=your-yandex-client-id
YANDEX_CLIENT_SECRET=your-yandex-client-secret
YANDEX_CALLBACK_URL=http://localhost:3000/auth/yandex/callback

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRY=7d

# Database
DATABASE_PATH=./quiz.db

# CORS
CLIENT_URL=http://localhost:5173

# AI Question Generation (optional, free tier available)
GROQ_API_KEY=your-groq-api-key
```

3. Run the server:

```bash
npm run start
```

Server will start on `http://localhost:3000`.

### Prod env (пример)

```text
NODE_ENV=production
PORT=3000
YANDEX_CLIENT_ID=your-yandex-client-id
YANDEX_CLIENT_SECRET=your-yandex-client-secret
YANDEX_CALLBACK_URL=https://quizz-room-server.onrender.com/auth/yandex/callback
JWT_SECRET=your-secret-key
JWT_EXPIRY=7d
DATABASE_PATH=./quiz.db
CLIENT_URL=https://quizzroom.netlify.app
GROQ_API_KEY=your-groq-api-key
```

### AI Question Generation

The server supports AI-powered question generation using Groq API (free tier available).

1. Get a free API key from [Groq Console](https://console.groq.com/)
2. Add `GROQ_API_KEY` to your `.env` file
3. Users can generate quiz questions by entering a topic in the quiz creation page

**Note:** If `GROQ_API_KEY` is not set, the AI generation feature will be disabled and show an error when used.


