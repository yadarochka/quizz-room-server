const { getDb, run, all, get } = require('../config/database');

async function createQuiz(creatorId, payload) {
  const db = getDb();

  const result = await run(
    db,
    'INSERT INTO quizzes (title, description, creator_id) VALUES (?, ?, ?)',
    [payload.title, payload.description || null, creatorId]
  );
  const quizId = result.lastID;

  let order = 1;
  for (const q of payload.questions || []) {
    const qResult = await run(
      db,
      'INSERT INTO questions (quiz_id, "order", text, time_limit) VALUES (?, ?, ?, ?)',
      [quizId, order++, q.text, q.time_limit]
    );
    const questionId = qResult.lastID;

    let ansOrder = 1;
    for (const a of q.answers || []) {
      await run(
        db,
        'INSERT INTO answers (question_id, text, is_correct, "order") VALUES (?, ?, ?, ?)',
        [questionId, a.text, a.is_correct ? 1 : 0, ansOrder++]
      );
    }
  }

  return get(db, 'SELECT * FROM quizzes WHERE id = ?', [quizId]);
}

async function getQuizWithQuestions(quizId) {
  const db = getDb();
  const quiz = await get(db, 'SELECT * FROM quizzes WHERE id = ?', [quizId]);
  if (!quiz) return null;

  const questions = await all(
    db,
    'SELECT * FROM questions WHERE quiz_id = ? ORDER BY "order" ASC',
    [quizId]
  );

  for (const q of questions) {
    const answers = await all(
      db,
      'SELECT id, text, "order" FROM answers WHERE question_id = ? ORDER BY "order" ASC',
      [q.id]
    );
    q.answers = answers;
  }

  quiz.questions = questions;
  return quiz;
}

async function updateQuiz(quizId, creatorId, payload) {
  const db = getDb();
  const quiz = await get(db, 'SELECT * FROM quizzes WHERE id = ?', [quizId]);
  if (!quiz) return null;
  if (quiz.creator_id !== creatorId) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }

  await run(
    db,
    'UPDATE quizzes SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [payload.title ?? quiz.title, payload.description ?? quiz.description, quizId]
  );

  if (payload.questions) {
    const questionIds = await all(db, 'SELECT id FROM questions WHERE quiz_id = ?', [quizId]);
    for (const q of questionIds) {
      await run(db, 'DELETE FROM answers WHERE question_id = ?', [q.id]);
    }
    await run(db, 'DELETE FROM questions WHERE quiz_id = ?', [quizId]);

    let order = 1;
    for (const q of payload.questions) {
      const qResult = await run(
        db,
        'INSERT INTO questions (quiz_id, "order", text, time_limit) VALUES (?, ?, ?, ?)',
        [quizId, order++, q.text, q.time_limit]
      );
      const questionId = qResult.lastID;

      let ansOrder = 1;
      for (const a of q.answers || []) {
        await run(
          db,
          'INSERT INTO answers (question_id, text, is_correct, "order") VALUES (?, ?, ?, ?)',
          [questionId, a.text, a.is_correct ? 1 : 0, ansOrder++]
        );
      }
    }
  }

  return getQuizWithQuestions(quizId);
}

async function deleteQuiz(quizId, creatorId) {
  const db = getDb();
  const quiz = await get(db, 'SELECT * FROM quizzes WHERE id = ?', [quizId]);
  if (!quiz) return null;
  if (quiz.creator_id !== creatorId) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }

  const activeSession = await get(
    db,
    'SELECT id FROM quiz_sessions WHERE quiz_id = ? AND status IN ("waiting","in_progress")',
    [quizId]
  );
  if (activeSession) {
    const err = new Error('Quiz has active sessions');
    err.status = 400;
    throw err;
  }

  await run(db, 'DELETE FROM quizzes WHERE id = ?', [quizId]);
  return true;
}

async function listQuizzesByCreator(creatorId, page = 1, limit = 10) {
  const db = getDb();
  const offset = (page - 1) * limit;

  const data = await all(
    db,
    'SELECT * FROM quizzes WHERE creator_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [creatorId, limit, offset]
  );
  const totalRow = await get(
    db,
    'SELECT COUNT(*) as count FROM quizzes WHERE creator_id = ?',
    [creatorId]
  );

  return {
    data,
    total: totalRow.count,
    page,
    limit
  };
}

module.exports = {
  createQuiz,
  getQuizWithQuestions,
  updateQuiz,
  deleteQuiz,
  listQuizzesByCreator
};


