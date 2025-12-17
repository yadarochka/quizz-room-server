const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  createQuizHandler,
  getQuizHandler,
  updateQuizHandler,
  deleteQuizHandler,
  listMyQuizzesHandler,
  generateQuestionsHandler
} = require('../controllers/quizController');

const router = express.Router();

router.post('/', authMiddleware.requireAuth, createQuizHandler);
router.post('/generate-questions', authMiddleware.requireAuth, generateQuestionsHandler);
router.get('/:quiz_id', getQuizHandler);
router.put('/:quiz_id', authMiddleware.requireAuth, updateQuizHandler);
router.delete('/:quiz_id', authMiddleware.requireAuth, deleteQuizHandler);
router.get('/', authMiddleware.requireAuth, listMyQuizzesHandler);

module.exports = router;


