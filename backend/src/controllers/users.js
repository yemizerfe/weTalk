const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../config/db');

const USER_SELECT = {
  id: true, email: true, username: true, avatar: true,
  isOnline: true, lastSeen: true, isEmailVerified: true,
  createdAt: true, updatedAt: true,
};

const updateProfileSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only').optional(),
  avatar: z.string().optional(),
});

const getAll = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { id: { not: req.user.id }, isDeleted: false },
      select: USER_SELECT,
      orderBy: { username: 'asc' },
    });
    res.json({ users });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

const search = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ users: [] });

    const users = await prisma.user.findMany({
      where: {
        id: { not: req.user.id },
        isDeleted: false,
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, email: true, username: true, avatar: true, isOnline: true, lastSeen: true },
      take: 20,
    });
    res.json({ users });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
};

const getById = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: USER_SELECT,
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

const updateMe = async (req, res) => {
  try {
    const { username, avatar } = updateProfileSchema.parse(req.body);

    // Build update data - only include fields that were actually provided
    const data = {};
    if (username !== undefined) data.username = username;
    if (avatar !== undefined) data.avatar = avatar;

    // If no fields to update, return current user
    if (Object.keys(data).length === 0) {
      return res.json({ message: 'No changes to save', user: req.user });
    }

    // Only check uniqueness when the username is actually changing.
    const currentUser = username !== undefined
      ? await prisma.user.findUnique({ where: { id: req.user.id }, select: { username: true } })
      : null;
    if (username !== undefined && currentUser && username !== currentUser.username) {
      const existing = await prisma.user.findFirst({
        where: { username, id: { not: req.user.id } },
        select: { id: true },
      });
      if (existing) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: USER_SELECT,
    });
    const { broadcastUserUpdate } = require('../socket');
    broadcastUserUpdate(user);
    res.json({ message: 'Profile updated successfully', user });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'Both passwords are required' });
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

const deleteMe = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required to delete your account' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    const deletedAt = new Date();
    const { activeUsers, broadcastUserDeleted } = require('../socket');
    activeUsers.delete(req.user.id);
    broadcastUserDeleted(req.user.id, deletedAt);
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        email: `deleted-${req.user.id}@deleted.local`,
        username: `deleted_${req.user.id.slice(0, 8)}`,
        password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        avatar: null,
        isOnline: false,
        lastSeen: deletedAt,
        isDeleted: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });
    res.clearCookie('token');
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
};

const onlineStatus = async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds)) return res.status(400).json({ error: 'userIds must be an array' });

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, isOnline: true, lastSeen: true },
    });

    const statusMap = Object.fromEntries(
      users.map((u) => [u.id, { isOnline: u.isOnline, lastSeen: u.lastSeen }])
    );
    res.json({ statusMap });
  } catch (err) {
    console.error('Online status error:', err);
    res.status(500).json({ error: 'Failed to fetch online status' });
  }
};

module.exports = { getAll, search, getById, updateMe, changePassword, deleteMe, onlineStatus };