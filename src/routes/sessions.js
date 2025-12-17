const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  createSessionHandler,
  getSessionHandler,
  getSessionByQuizHandler,
  getSessionResultsHandler
} = require('../controllers/sessionController');

const router = express.Router();

// POST /api/sessions - create new quiz session (requires auth)
router.post('/', authMiddleware.requireAuth, createSessionHandler);

// GET /api/sessions/quiz/:quiz_id - get active session by quiz_id
router.get('/quiz/:quiz_id', getSessionByQuizHandler);

// GET /api/sessions/:session_id - get session info
router.get('/:session_id', getSessionHandler);

// GET /api/sessions/:session_id/results - get session results
router.get('/:session_id/results', getSessionResultsHandler);

module.exports = router;


