const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const CallController = require('../controllers/calls');

const router = Router();

router.use(authenticate);

// Get call history for a conversation
router.get('/history/:conversationId', CallController.getCallHistory);

// Get recent calls for user
router.get('/recent', CallController.getRecentCalls);

// Get specific call details
router.get('/:callId', CallController.getCallDetails);

// Get call statistics
router.get('/stats/summary', CallController.getCallStats);

// Get missed calls count
router.get('/missed/count', CallController.getMissedCallsCount);

module.exports = router;