const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

const USER_SELECT = {
  id: true, email: true, username: true, avatar: true,
  isOnline: true, lastSeen: true, isEmailVerified: true,
  createdAt: true, updatedAt: true,
};

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: USER_SELECT });
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.headers.cookie
      ?.split('; ')
      .find(row => row.startsWith('token='))
      ?.split('=')[1];
    if (!token) return next(new Error('No token provided'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, username: true, avatar: true, isOnline: true, lastSeen: true, isEmailVerified: true },
    });
    if (!user) return next(new Error('Invalid token'));

    socket.user = user;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
};

module.exports = { authenticate, authenticateSocket };
