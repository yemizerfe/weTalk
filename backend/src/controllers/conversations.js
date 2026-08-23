const prisma = require('../config/db');

const USER_SELECT = {
  id: true, username: true, avatar: true, isOnline: true, lastSeen: true, isDeleted: true,
};

const INCLUDE_SHAPE = {
  user1: { select: USER_SELECT },
  user2: { select: USER_SELECT },
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, content: true, messageType: true, isRead: true, createdAt: true, senderId: true },
  },
};

const formatConversation = (conv, currentUserId) => ({
  id: conv.id,
  otherUser: (() => {
    const otherUser = conv.user1Id === currentUserId ? conv.user2 : conv.user1;
    return otherUser.isDeleted
      ? { ...otherUser, username: 'Deleted account', avatar: null, isOnline: false }
      : otherUser;
  })(),
  lastMessage: conv.messages?.[0] || null,
  createdAt: conv.createdAt,
  updatedAt: conv.updatedAt,
});

const getAll = async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { OR: [{ user1Id: req.user.id }, { user2Id: req.user.id }] },
      include: INCLUDE_SHAPE,
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ conversations: conversations.map((c) => formatConversation(c, req.user.id)) });
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

const getById = async (req, res) => {
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_SHAPE,
    });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.user1Id !== req.user.id && conv.user2Id !== req.user.id)
      return res.status(403).json({ error: 'Access denied' });

    res.json(formatConversation(conv, req.user.id));
  } catch (err) {
    console.error('Get conversation error:', err);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
};

const createOrGet = async (req, res) => {
  try {
    const { userId: otherUserId } = req.body;
    if (!otherUserId) return res.status(400).json({ error: 'userId is required' });
    if (req.user.id === otherUserId)
      return res.status(400).json({ error: 'Cannot create conversation with yourself' });

    const [user1Id, user2Id] = [req.user.id, otherUserId].sort();

    let conv = await prisma.conversation.findFirst({
      where: { user1Id, user2Id },
      include: INCLUDE_SHAPE,
    });

    if (!conv) {
      conv = await prisma.conversation.create({
        data: { user1Id, user2Id },
        include: INCLUDE_SHAPE,
      });
    }

    res.status(201).json(formatConversation(conv, req.user.id));
  } catch (err) {
    console.error('Create conversation error:', err);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};

const remove = async (req, res) => {
  try {
    const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.user1Id !== req.user.id && conv.user2Id !== req.user.id)
      return res.status(403).json({ error: 'Access denied' });

    await prisma.conversation.delete({ where: { id: req.params.id } });
    res.json({ message: 'Conversation deleted successfully' });
  } catch (err) {
    console.error('Delete conversation error:', err);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
};

module.exports = { getAll, getById, createOrGet, remove };
