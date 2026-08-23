const prisma = require('../config/db');

// Delete a message. mode: 'me' soft-deletes only for the requesting user,
// 'everyone' hard-deletes the message for all users.
const remove = async (req, res) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const conv = await prisma.conversation.findUnique({ where: { id: message.conversationId } });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.user1Id !== req.user.id && conv.user2Id !== req.user.id)
      return res.status(403).json({ error: 'Access denied' });

    const { mode = 'everyone' } = req.body;
    if (mode === 'me') {
      // Soft delete: only hide the message for this user
      await prisma.messageDeletion.upsert({
        where: { messageId_userId: { messageId: message.id, userId: req.user.id } },
        update: {},
        create: { messageId: message.id, userId: req.user.id },
      });
    } else {
      // Hard delete: remove for everyone
      await prisma.messageDeletion.deleteMany({ where: { messageId: message.id } });
      await prisma.message.delete({ where: { id: message.id } });
    }

    res.json({ message: 'Message deleted successfully', mode });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

const getByConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.user1Id !== req.user.id && conv.user2Id !== req.user.id)
      return res.status(403).json({ error: 'Access denied' });

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        deletions: { none: { userId: req.user.id } },
      },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        readReceipts: { where: { userId: req.user.id } },
        reactions: {
          include: { user: { select: { id: true, username: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    // Mark incoming messages as read
    await prisma.message.updateMany({
      where: { conversationId, senderId: { not: req.user.id }, isRead: false },
      data: { isRead: true },
    });

    // Create read receipts for previously unread messages
    const unread = messages.filter((m) => m.senderId !== req.user.id && !m.isRead);
    await Promise.all(
      unread.map((m) =>
        prisma.readReceipt.upsert({
          where: { messageId_userId: { messageId: m.id, userId: req.user.id } },
          update: {},
          create: { messageId: m.id, userId: req.user.id },
        })
      )
    );

    res.json({ messages });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

const send = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, messageType = 'text' } = req.body;

    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    if (conv.user1Id !== req.user.id && conv.user2Id !== req.user.id)
      return res.status(403).json({ error: 'Access denied' });
    if (!content?.trim()) return res.status(400).json({ error: 'Message content is required' });

    const receiverId = conv.user1Id === req.user.id ? conv.user2Id : conv.user1Id;
    const message = await prisma.message.create({
      data: { conversationId, senderId: req.user.id, receiverId, content: content.trim(), messageType },
      include: { sender: { select: { id: true, username: true, avatar: true } } },
    });

    await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    res.status(201).json({ message });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

const unreadCount = async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { OR: [{ user1Id: req.user.id }, { user2Id: req.user.id }] },
      select: { id: true },
    });

    const count = await prisma.message.count({
      where: {
        conversationId: { in: conversations.map((c) => c.id) },
        senderId: { not: req.user.id },
        isRead: false,
      },
    });

    res.json({ unreadCount: count });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
};

module.exports = { getByConversation, send, remove, unreadCount };
