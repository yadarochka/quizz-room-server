const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  createSessionHandler,
  getSessionHandler,
  getSessionResultsHandler
} = require('../controllers/sessionController');

const router = express.Router();

// POST /api/sessions - create new quiz session (requires auth)
router.post('/', authMiddleware.requireAuth, createSessionHandler);

// GET /api/sessions/:session_id - get session info
router.get('/:session_id', getSessionHandler);

// GET /api/sessions/:session_id/results - get session results
router.get('/:session_id/results', getSessionResultsHandler);

module.exports = router;


