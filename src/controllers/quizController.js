const Joi = require('joi');
const {
  createQuiz,
  getQuizWithQuestions,
  updateQuiz,
  deleteQuiz,
  listQuizzesByCreator
} = require('../models/quiz');
const { generateQuestions } = require('../services/aiGenerator');

const quizSchema = Joi.object({
  title: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow('').optional(),
  questions: Joi.array().items(
    Joi.object({
      text: Joi.string().min(1).required(),
      time_limit: Joi.number().integer().min(5).max(600).required(),
      answers: Joi.array().items(
        Joi.object({
          text: Joi.string().min(1).required(),
          is_correct: Joi.boolean().required()
        })
      ).min(1).required()
    })
  ).min(1).required()
});

async function createQuizHandler(req, res, next) {
  try {
    const { error, value } = quizSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    const quiz = await createQuiz(req.user.id, value);
    res.status(201).json({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      creator_id: quiz.creator_id,
      created_at: quiz.created_at
    });
  } catch (err) {
    next(err);
  }
}

async function getQuizHandler(req, res, next) {
  try {
    const quiz = await getQuizWithQuestions(req.params.quiz_id);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    res.json(quiz);
  } catch (err) {
    next(err);
  }
}

async function updateQuizHandler(req, res, next) {
  try {
    const { error, value } = quizSchema.validate(req.body, { allowUnknown: true, presence: 'optional' });
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    const quiz = await updateQuiz(req.params.quiz_id, req.user.id, value);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    res.json(quiz);
  } catch (err) {
    next(err);
  }
}

async function deleteQuizHandler(req, res, next) {
  try {
    const deleted = await deleteQuiz(req.params.quiz_id, req.user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listMyQuizzesHandler(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await listQuizzesByCreator(req.user.id, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

const generateQuestionsSchema = Joi.object({
  topic: Joi.string().min(1).max(255).required(),
  count: Joi.number().integer().min(1).max(20).optional().default(5)
});

async function generateQuestionsHandler(req, res, next) {
  try {
    const { error, value } = generateQuestionsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const questions = await generateQuestions(value.topic, value.count);
    res.json({ questions });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Generate questions error:', err);
    res.status(500).json({ 
      error: err.message || 'Failed to generate questions. Please check your API key configuration.' 
    });
  }
}

module.exports = {
  createQuizHandler,
  getQuizHandler,
  updateQuizHandler,
  deleteQuizHandler,
  listMyQuizzesHandler,
  generateQuestionsHandler
};


