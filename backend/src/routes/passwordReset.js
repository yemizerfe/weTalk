const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const PasswordResetController = require('../controllers/passwordReset');

const router = Router();

// Verify email and username (public route)
router.post('/verify', PasswordResetController.verifyIdentity);

// Request password reset (public route)
router.post('/request', PasswordResetController.requestReset);

// Get reset history (protected route)
router.get('/history', authenticate, PasswordResetController.getResetHistory);

module.exports = router;
