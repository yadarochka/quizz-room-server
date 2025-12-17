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
    `SELECT qs.id as session_id, q.title as quiz_title, qs.quiz_id
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

  // Get detailed answers for each participant
  const participantsWithDetails = await Promise.all(rows.map(async (r) => {
    const answers = await all(
      db,
      `SELECT ua.question_id,
              ua.selected_answer_id,
              ua.is_correct,
              q.text as question_text,
              q."order" as question_order,
              a.text as selected_answer_text,
              correct_a.text as correct_answer_text
       FROM user_answers ua
       JOIN questions q ON ua.question_id = q.id
       LEFT JOIN answers a ON ua.selected_answer_id = a.id
       LEFT JOIN answers correct_a ON correct_a.question_id = q.id AND correct_a.is_correct = 1
       WHERE ua.session_id = ? AND ua.user_id = ?
       ORDER BY q."order"`,
      [sessionId, r.user_id]
    );

    return {
      user_id: r.user_id,
      display_name: r.display_name,
      correct_answers: r.correct_answers,
      total_questions: r.total_questions,
      score: r.score,
      answers: answers.map(a => ({
        question_id: a.question_id,
        question_text: a.question_text,
        question_order: a.question_order,
        selected_answer_id: a.selected_answer_id,
        selected_answer_text: a.selected_answer_text,
        correct_answer_text: a.correct_answer_text,
        is_correct: a.is_correct === 1
      }))
    };
  }));

  // Get all questions with their correct answers
  const allQuestions = await all(
    db,
    `SELECT q.id, q.text, q."order",
            GROUP_CONCAT(a.id || ':' || a.text || ':' || a.is_correct, '|') as answers_data
     FROM questions q
     LEFT JOIN answers a ON a.question_id = q.id
     WHERE q.quiz_id = ?
     GROUP BY q.id, q.text, q."order"
     ORDER BY q."order"`,
    [session.quiz_id]
  );

  const questionsWithAnswers = allQuestions.map(q => {
    const answers = q.answers_data ? q.answers_data.split('|').map(a => {
      const [id, text, isCorrect] = a.split(':');
      return {
        id: parseInt(id),
        text: text,
        is_correct: isCorrect === '1'
      };
    }) : [];
    return {
      id: q.id,
      text: q.text,
      order: q.order,
      answers: answers
    };
  });

  return {
    session_id: session.session_id,
    quiz_title: session.quiz_title,
    total_questions: rows[0] ? rows[0].total_questions : 0,
    participants: participantsWithDetails,
    questions: questionsWithAnswers
  };
}

module.exports = {
  createSession,
  getSessionById,
  getSessionByQuizId,
  getSessionResults
};


