const Joi = require('joi');
const { getDb, get } = require('../config/database');
const {
  createSession,
  getSessionById,
  getSessionResults
} = require('../models/session');

const createSessionSchema = Joi.object({
  quiz_id: Joi.number().integer().required()
});

async function createSessionHandler(req, res, next) {
  try {
    const { error, value } = createSessionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const db = getDb();
    const quiz = await get(db, 'SELECT * FROM quizzes WHERE id = ?', [value.quiz_id]);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    if (quiz.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const session = await createSession(value.quiz_id, req.user.id);

    res.status(201).json({
      id: session.id,
      quiz_id: session.quiz_id,
      room_code: session.room_code,
      status: session.status,
      created_at: session.created_at
    });
  } catch (err) {
    next(err);
  }
}

async function getSessionHandler(req, res, next) {
  try {
    const session = await getSessionById(req.params.session_id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({
      id: session.id,
      quiz_id: session.quiz_id,
      room_code: session.room_code,
      status: session.status,
      participants: session.participants
    });
  } catch (err) {
    next(err);
  }
}

async function getSessionResultsHandler(req, res, next) {
  try {
    const result = await getSessionResults(req.params.session_id);
    if (!result) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createSessionHandler,
  getSessionHandler,
  getSessionResultsHandler
};


