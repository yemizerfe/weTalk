const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  register,
  login,
  logout,
  me,
  checkUsername,
} = require('../controllers/auth');

const router = Router();

router.post('/register', register);
router.get('/username-availability', checkUsername);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticate, me);

module.exports = router;