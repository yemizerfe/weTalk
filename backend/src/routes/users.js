const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { getAll, search, getById, updateMe, changePassword, deleteMe, onlineStatus } = require('../controllers/users');

const router = Router();

router.use(authenticate);

router.get('/', getAll);
router.get('/search', search);
router.get('/:id', getById);
router.put('/me', updateMe);
router.put('/me/password', changePassword);
router.delete('/me', deleteMe);
router.post('/online-status', onlineStatus);

module.exports = router;
