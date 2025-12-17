const { getDb, get, all, run } = require('../config/database');
const { getQuizWithQuestions } = require('../models/quiz');

// In-memory state for running sessions (current question, timers)
const sessionRuntimeState = new Map();

function getSessionRoom(sessionId) {
  return `session_${sessionId}`;
}

async function handleJoinRoom(io, socket, user, payload) {
  try {
    const { room_code, display_name } = payload || {};
    if (!room_code || !display_name) {
      return socket.emit('room_join_error', { error: 'room_code and display_name are required' });
    }

    if (!user) {
      return socket.emit('room_join_error', { error: 'Authentication required' });
    }

    const db = getDb();
    const session = await get(
      db,
      'SELECT * FROM quiz_sessions WHERE room_code = ? AND status IN ("waiting","in_progress")',
      [room_code]
    );

    if (!session) {
      return socket.emit('room_join_error', { error: 'Комната не найдена или уже закрыта' });
    }

    // Register participant if not exists
    let participant = await get(
      db,
      'SELECT * FROM session_participants WHERE session_id = ? AND user_id = ?',
      [session.id, user.id]
    );

    if (!participant) {
      await run(
        db,
        'INSERT INTO session_participants (session_id, user_id, display_name) VALUES (?, ?, ?)',
        [session.id, user.id, display_name]
      );
    }

    const participantsRows = await all(
      db,
      'SELECT user_id, display_name, joined_at FROM session_participants WHERE session_id = ?',
      [session.id]
    );

    const room = getSessionRoom(session.id);
    socket.join(room);
    socket.data.sessionId = session.id;
    socket.data.displayName = display_name;
    socket.data.userId = user.id;

    const participants = participantsRows.map((p) => ({
      socket_id: p.user_id === user.id ? socket.id : null,
      display_name: p.display_name,
      user_id: p.user_id
    }));

    socket.emit('room_joined', {
      session_id: session.id,
      quiz_id: session.quiz_id,
      participants
    });

    io.to(room).emit('participant_joined', {
      display_name,
      total_participants: participantsRows.length
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('join_room error', err);
    socket.emit('room_join_error', { error: 'Internal server error' });
  }
}

async function startQuestion(io, sessionId, questionIndex) {
  const state = sessionRuntimeState.get(sessionId);
  if (!state) return;

  const question = state.questions[questionIndex];
  if (!question) return;

  state.currentQuestionIndex = questionIndex;

  const room = getSessionRoom(sessionId);

  io.to(room).emit('quiz_started', {
    current_question: questionIndex + 1,
    total_questions: state.questions.length
  });

  io.to(room).emit('next_question', {
    question_id: question.id,
    question_text: question.text,
    answers: question.answers.map((a) => ({ id: a.id, text: a.text })),
    time_limit: question.time_limit,
    question_number: questionIndex + 1,
    total_questions: state.questions.length
  });

  if (state.timer) {
    clearTimeout(state.timer);
  }

  state.timer = setTimeout(() => {
    handleQuestionTimeout(io, sessionId, questionIndex).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('question timeout error', err);
    });
  }, question.time_limit * 1000);
}

async function handleQuestionTimeout(io, sessionId, questionIndex) {
  const state = sessionRuntimeState.get(sessionId);
  if (!state) return;

  const question = state.questions[questionIndex];
  if (!question) return;

  const db = getDb();

  const correctAnswerRow = await get(
    db,
    'SELECT id FROM answers WHERE question_id = ? AND is_correct = 1 LIMIT 1',
    [question.id]
  );
  const correctAnswerId = correctAnswerRow ? correctAnswerRow.id : null;

  const answerRows = await all(
    db,
    `SELECT ua.selected_answer_id as answer_id,
            sp.display_name
     FROM user_answers ua
     JOIN session_participants sp
       ON sp.session_id = ua.session_id AND sp.user_id = ua.user_id
     WHERE ua.session_id = ? AND ua.question_id = ? AND ua.selected_answer_id IS NOT NULL`,
    [sessionId, question.id]
  );

  const breakdownMap = new Map();
  for (const row of answerRows) {
    if (!breakdownMap.has(row.answer_id)) {
      breakdownMap.set(row.answer_id, { answer_id: row.answer_id, count: 0, display_name: [] });
    }
    const entry = breakdownMap.get(row.answer_id);
    entry.count += 1;
    entry.display_name.push(row.display_name);
  }

  const answers_breakdown = Array.from(breakdownMap.values());

  const room = getSessionRoom(sessionId);
  io.to(room).emit('question_timeout', {
    correct_answer_id: correctAnswerId,
    answers_breakdown
  });

  const nextIndex = questionIndex + 1;
  if (nextIndex < state.questions.length) {
    setTimeout(() => {
      startQuestion(io, sessionId, nextIndex).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('start next question error', err);
      });
    }, 5000);
  } else {
    setTimeout(() => {
      finishQuiz(io, sessionId).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('finish quiz error', err);
      });
    }, 5000);
  }
}

async function finishQuiz(io, sessionId) {
  const db = getDb();

  const session = await get(db, 'SELECT * FROM quiz_sessions WHERE id = ?', [sessionId]);
  if (!session) return;

  const questionCountRow = await get(
    db,
    'SELECT COUNT(*) as cnt FROM questions WHERE quiz_id = ?',
    [session.quiz_id]
  );
  const totalQuestions = questionCountRow ? questionCountRow.cnt : 0;

  const participantRows = await all(
    db,
    'SELECT user_id, display_name FROM session_participants WHERE session_id = ?',
    [sessionId]
  );

  const results = [];

  for (const p of participantRows) {
    const correctRow = await get(
      db,
      'SELECT COUNT(*) as cnt FROM user_answers WHERE session_id = ? AND user_id = ? AND is_correct = 1',
      [sessionId, p.user_id]
    );
    const correctAnswers = correctRow ? correctRow.cnt : 0;
    const score = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;

    await run(
      db,
      `INSERT INTO session_results (session_id, user_id, total_questions, correct_answers, score)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, p.user_id, totalQuestions, correctAnswers, score]
    );

    results.push({
      display_name: p.display_name,
      correct_answers: correctAnswers,
      total_questions: totalQuestions,
      score
    });
  }

  await run(
    db,
    'UPDATE quiz_sessions SET status = "completed", ended_at = CURRENT_TIMESTAMP WHERE id = ?',
    [sessionId]
  );

  const room = getSessionRoom(sessionId);
  io.to(room).emit('quiz_finished', { results });

  const state = sessionRuntimeState.get(sessionId);
  if (state && state.timer) {
    clearTimeout(state.timer);
  }
  sessionRuntimeState.delete(sessionId);
}

async function handleStartQuiz(io, socket, user, payload) {
  try {
    const { session_id } = payload || {};
    if (!session_id) {
      return socket.emit('quiz_error', { error: 'session_id is required' });
    }
    if (!user) {
      return socket.emit('quiz_error', { error: 'Authentication required' });
    }

    const db = getDb();
    const session = await get(db, 'SELECT * FROM quiz_sessions WHERE id = ?', [session_id]);
    if (!session) {
      return socket.emit('quiz_error', { error: 'Session not found' });
    }

    if (session.creator_id !== user.id) {
      return socket.emit('quiz_error', { error: 'Only creator can start quiz' });
    }

    const quiz = await getQuizWithQuestions(session.quiz_id);
    if (!quiz || !quiz.questions || quiz.questions.length === 0) {
      return socket.emit('quiz_error', { error: 'Quiz has no questions' });
    }

    await run(
      db,
      'UPDATE quiz_sessions SET status = "in_progress", started_at = CURRENT_TIMESTAMP WHERE id = ?',
      [session_id]
    );

    sessionRuntimeState.set(session_id, {
      questions: quiz.questions,
      currentQuestionIndex: 0,
      timer: null
    });

    await startQuestion(io, session_id, 0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('start_quiz error', err);
    socket.emit('quiz_error', { error: 'Internal server error' });
  }
}

async function handleSubmitAnswer(io, socket, user, payload) {
  try {
    const { question_id, answer_id } = payload || {};
    if (!question_id || !answer_id) {
      return socket.emit('answer_error', { error: 'question_id and answer_id are required' });
    }
    if (!user) {
      return socket.emit('answer_error', { error: 'Authentication required' });
    }

    const sessionId = socket.data.sessionId;
    if (!sessionId) {
      return socket.emit('answer_error', { error: 'Not in a session' });
    }

    const db = getDb();

    const ansRow = await get(
      db,
      'SELECT is_correct FROM answers WHERE id = ? AND question_id = ?',
      [answer_id, question_id]
    );
    if (!ansRow) {
      return socket.emit('answer_error', { error: 'Invalid answer' });
    }

    const isCorrect = ansRow.is_correct ? 1 : 0;

    const existing = await get(
      db,
      'SELECT id FROM user_answers WHERE session_id = ? AND user_id = ? AND question_id = ?',
      [sessionId, user.id, question_id]
    );

    if (existing) {
      await run(
        db,
        'UPDATE user_answers SET selected_answer_id = ?, is_correct = ?, answered_at = CURRENT_TIMESTAMP WHERE id = ?',
        [answer_id, isCorrect, existing.id]
      );
    } else {
      await run(
        db,
        `INSERT INTO user_answers (session_id, user_id, question_id, selected_answer_id, is_correct)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, user.id, question_id, answer_id, isCorrect]
      );
    }

    socket.emit('answer_submitted', { status: 'ok' });

    const room = getSessionRoom(sessionId);
    io.to(room).emit('participant_answered', {
      display_name: socket.data.displayName || user.name || 'Unknown',
      answered: true
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('submit_answer error', err);
    socket.emit('answer_error', { error: 'Internal server error' });
  }
}

function handleLeaveRoom(io, socket) {
  const sessionId = socket.data.sessionId;
  const displayName = socket.data.displayName;

  if (sessionId) {
    const room = getSessionRoom(sessionId);
    socket.leave(room);

    const roomData = io.sockets.adapter.rooms.get(room);
    const total = roomData ? roomData.size : 0;

    io.to(room).emit('participant_left', {
      display_name: displayName,
      total_participants: total
    });
  }

  socket.disconnect(true);
}

function registerSocketHandlers(io, socket, user) {
  socket.on('join_room', (payload) => {
    handleJoinRoom(io, socket, user, payload);
  });

  socket.on('start_quiz', (payload) => {
    handleStartQuiz(io, socket, user, payload);
  });

  socket.on('submit_answer', (payload) => {
    handleSubmitAnswer(io, socket, user, payload);
  });

  socket.on('leave_room', () => {
    handleLeaveRoom(io, socket);
  });

  socket.on('disconnect', () => {
    handleLeaveRoom(io, socket);
  });
}

module.exports = {
  registerSocketHandlers
};


