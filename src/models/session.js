const { getDb, run, all, get } = require('../config/database');

function generateRoomCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function createSession(quizId, creatorId) {
  const db = getDb();

  let roomCode;
  let exists = true;
  while (exists) {
    roomCode = generateRoomCode();
    const row = await get(db, 'SELECT id FROM quiz_sessions WHERE room_code = ?', [roomCode]);
    exists = !!row;
  }

  const result = await run(
    db,
    'INSERT INTO quiz_sessions (quiz_id, room_code, creator_id, status) VALUES (?, ?, ?, ?)',
    [quizId, roomCode, creatorId, 'waiting']
  );

  return get(db, 'SELECT * FROM quiz_sessions WHERE id = ?', [result.lastID]);
}

async function getSessionById(sessionId) {
  const db = getDb();
  const session = await get(db, 'SELECT * FROM quiz_sessions WHERE id = ?', [sessionId]);
  if (!session) return null;

  const participants = await all(
    db,
    'SELECT user_id, display_name, joined_at FROM session_participants WHERE session_id = ?',
    [sessionId]
  );

  session.participants = participants;
  return session;
}

async function getSessionByQuizId(quizId) {
  const db = getDb();
  const session = await get(
    db,
    'SELECT * FROM quiz_sessions WHERE quiz_id = ? AND status IN ("waiting","in_progress") ORDER BY created_at DESC LIMIT 1',
    [quizId]
  );
  if (!session) return null;

  const participants = await all(
    db,
    'SELECT user_id, display_name, joined_at FROM session_participants WHERE session_id = ?',
    [session.id]
  );

  session.participants = participants;
  return session;
}

async function getSessionResults(sessionId) {
  const db = getDb();

  const session = await get(
    db,
    `SELECT qs.id as session_id, q.title as quiz_title
     FROM quiz_sessions qs
     JOIN quizzes q ON qs.quiz_id = q.id
     WHERE qs.id = ?`,
    [sessionId]
  );
  if (!session) return null;

  const rows = await all(
    db,
    `SELECT sr.user_id,
            sp.display_name,
            sr.correct_answers,
            sr.total_questions,
            sr.score
     FROM session_results sr
     JOIN session_participants sp
       ON sp.session_id = sr.session_id AND sp.user_id = sr.user_id
     WHERE sr.session_id = ?`,
    [sessionId]
  );

  return {
    session_id: session.session_id,
    quiz_title: session.quiz_title,
    total_questions: rows[0] ? rows[0].total_questions : 0,
    participants: rows.map(r => ({
      user_id: r.user_id,
      display_name: r.display_name,
      correct_answers: r.correct_answers,
      score: r.score
    }))
  };
}

module.exports = {
  createSession,
  getSessionById,
  getSessionByQuizId,
  getSessionResults
};


