const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Validate password meets requirements: at least 8 chars, 1 uppercase, 1 number
function validatePasswordStrength(password) {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least 1 uppercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least 1 number' };
  }
  return { valid: true };
}

class PasswordResetController {
  // Verify email and username exist
  static async verifyIdentity(req, res) {
    try {
      const { email, username } = req.body;

      if (!email || !username) {
        return res.status(400).json({ error: 'Email and username are required' });
      }

      const user = await prisma.user.findFirst({
        where: { email: email.toLowerCase().trim(), username, isDeleted: false },
        select: { id: true, email: true, username: true },
      });

      if (!user) {
        return res.status(400).json({ error: 'Email and username do not match any account' });
      }

      res.json({ valid: true, message: 'Identity verified. You can now set a new password.' });
    } catch (error) {
      console.error('Verify identity error:', error);
      res.status(500).json({ error: 'Failed to verify identity' });
    }
  }

  // Request password reset
  static async requestReset(req, res) {
    try {
      const { email, username, password } = req.body;

      if (!email || !username || !password) {
        return res.status(400).json({ error: 'Email, username, and new password are required' });
      }
      const pwCheck = validatePasswordStrength(password);
      if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });
      const user = await prisma.user.findFirst({ where: { email: email.toLowerCase().trim(), username, isDeleted: false } });
      if (!user) return res.status(400).json({ error: 'Email and username do not match' });
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });
      res.json({ message: 'Password reset successfully. You can now sign in.' });
    } catch (error) {
      console.error('Request reset error:', error);
      res.status(500).json({ error: 'Failed to process password reset request' });
    }
  }

  // Verify reset token
  static async verifyToken(req, res) {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({ error: 'Token is required' });
      }

      // Hash the token to compare with stored hash
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // Find valid token
      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          token: hashedToken,
          used: false,
          expiresAt: {
            gt: new Date()
          }
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true
            }
          }
        }
      });

      if (!resetToken) {
        return res.status(400).json({
          error: 'Invalid or expired reset token'
        });
      }

      res.json({
        valid: true,
        email: resetToken.user.email,
        username: resetToken.user.username
      });
    } catch (error) {
      console.error('Verify token error:', error);
      res.status(500).json({ error: 'Failed to verify token' });
    }
  }

  // Reset password
  static async resetPassword(req, res) {
    try {
      const { token } = req.params;
      const { password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ error: 'Token and password are required' });
      }

      const pwCheck = validatePasswordStrength(password);
      if (!pwCheck.valid) {
        return res.status(400).json({ error: pwCheck.error });
      }

      // Hash the token
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // Find valid token
      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          token: hashedToken,
          used: false,
          expiresAt: {
            gt: new Date()
          }
        }
      });

      if (!resetToken) {
        return res.status(400).json({
          error: 'Invalid or expired reset token'
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update user password
      await prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword }
      });

      // Mark token as used
      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true }
      });

      // Create notification
      await prisma.notification.create({
        data: {
          userId: resetToken.userId,
          type: 'system',
          title: 'Password Changed',
          message: 'Your password has been successfully changed. If you did not make this change, please contact support immediately.'
        }
      });

      console.log('Password reset successful for user:', resetToken.userId);

      res.json({
        message: 'Password has been reset successfully. You can now login with your new password.'
      });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }

  // Get reset history (admin/debugging)
  static async getResetHistory(req, res) {
    try {
      const userId = req.user.id;

      const history = await prisma.passwordResetToken.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          used: true
        }
      });

      res.json({ history });
    } catch (error) {
      console.error('Get reset history error:', error);
      res.status(500).json({ error: 'Failed to get reset history' });
    }
  }
}

module.exports = PasswordResetController;