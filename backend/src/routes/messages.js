const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { getByConversation, send, remove, unreadCount } = require('../controllers/messages');

const router = Router();

router.use(authenticate);

router.get('/unread/count', unreadCount);
router.get('/conversation/:conversationId', getByConversation);
router.post('/conversation/:conversationId', send);
router.delete('/:id', remove);

module.exports = router;
