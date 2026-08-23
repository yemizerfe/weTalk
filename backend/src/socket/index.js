const prisma = require('../config/db');
const { authenticateSocket } = require('../middleware/auth');

// userId -> { socketId, user }
const activeUsers = new Map();
let socketIO = null;

const broadcastUserUpdate = (user) => {
  if (socketIO) socketIO.emit('user:updated', user);
};

const broadcastUserDeleted = (userId, lastSeen) => {
  if (socketIO) socketIO.emit('user:deleted', { userId, lastSeen });
};

const initializeSocket = (io) => {
  socketIO = io;
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { user } = socket;
    console.log(`Connected: ${user.username} (${user.id})`);

    activeUsers.set(user.id, { socketId: socket.id, user });

    prisma.user.update({ where: { id: user.id }, data: { isOnline: true } })
      .catch((err) => console.error('Online status update error:', err));

    io.emit('user:online', { userId: user.id, isOnline: true, lastSeen: user.lastSeen });

    socket.emit('users:active', Array.from(activeUsers.values()).map(({ user: u }) => ({
      id: u.id, username: u.username, avatar: u.avatar, isOnline: true, lastSeen: u.lastSeen,
    })));

    socket.on('conversation:join', (conversationId) => socket.join(conversationId));
    socket.on('conversation:leave', (conversationId) => socket.leave(conversationId));

    socket.on('presence:update', async ({ isOnline }) => {
      try {
        const online = Boolean(isOnline);
        const lastSeen = online ? undefined : new Date();
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: { isOnline: online, ...(lastSeen ? { lastSeen } : {}) },
          select: { id: true, username: true, avatar: true, isOnline: true, lastSeen: true },
        });
        activeUsers.set(user.id, { socketId: socket.id, user: updatedUser });
        io.emit('user:online', {
          userId: updatedUser.id,
          isOnline: updatedUser.isOnline,
          lastSeen: updatedUser.lastSeen,
        });
      } catch (err) {
        console.error('presence:update error:', err);
      }
    });

    socket.on('profile:update', async ({ username, avatar }) => {
      try {
        const updatedUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { id: true, username: true, avatar: true, isOnline: true, lastSeen: true },
        });
        if (!updatedUser) return;
        activeUsers.set(user.id, { socketId: socket.id, user: updatedUser });
        broadcastUserUpdate(updatedUser);
      } catch (err) {
        console.error('profile:update error:', err);
      }
    });

    socket.on('message:send', async (data) => {
      try {
        const { conversationId, content, messageType = 'text' } = data;
        if (!conversationId || !content)
          return socket.emit('message:error', { error: 'conversationId and content are required' });

        const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (!conv) return socket.emit('message:error', { error: 'Conversation not found' });
        if (conv.user1Id !== user.id && conv.user2Id !== user.id)
          return socket.emit('message:error', { error: 'Access denied' });

        const receiverId = conv.user1Id === user.id ? conv.user2Id : conv.user1Id;
        const message = await prisma.message.create({
          data: { conversationId, senderId: user.id, receiverId, content: content.trim(), messageType },
          include: { sender: { select: { id: true, username: true, avatar: true } } },
        });

        await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

        const messagePayload = {
          id: message.id,
          conversationId,
          senderId: message.senderId,
          sender: message.sender,
          content: message.content,
          messageType: message.messageType,
          isRead: false,
          isDelivered: true,
          reactions: [],
          createdAt: message.createdAt,
        };
        io.to(conversationId).emit('message:new', messagePayload);

        const lastMessageData = {
          conversationId,
          lastMessage: {
            id: message.id,
            content: message.content,
            messageType: message.messageType,
            createdAt: message.createdAt,
            senderId: message.senderId,
          },
        };

        // Update both users' conversation lists
        socket.emit('conversation:updated', lastMessageData);
        const otherSocket = activeUsers.get(receiverId);
        if (otherSocket) {
          const receiverSocket = io.sockets.sockets.get(otherSocket.socketId);
          if (!receiverSocket?.rooms.has(conversationId)) {
            io.to(otherSocket.socketId).emit('message:new', messagePayload);
            io.to(otherSocket.socketId).emit('conversation:updated', {
              ...lastMessageData,
              otherUser: message.sender,
            });
          } else {
            io.to(otherSocket.socketId).emit('conversation:updated', lastMessageData);
          }
        }
      } catch (err) {
        console.error('message:send error:', err);
        socket.emit('message:error', { error: 'Failed to send message' });
      }
    });

    socket.on('message:edit', async ({ messageId, content }) => {
      try {
        if (!messageId || !content?.trim())
          return socket.emit('message:error', { error: 'messageId and content are required' });

        const existing = await prisma.message.findUnique({ where: { id: messageId } });
        if (!existing) return socket.emit('message:error', { error: 'Message not found' });
        if (existing.senderId !== user.id)
          return socket.emit('message:error', { error: 'Access denied' });

        const updated = await prisma.message.update({
          where: { id: messageId },
          data: { content: content.trim(), isEdited: true, editedAt: new Date() },
          include: { sender: { select: { id: true, username: true, avatar: true } } },
        });

        io.to(existing.conversationId).emit('message:edited', {
          id: updated.id,
          conversationId: existing.conversationId,
          content: updated.content,
          isEdited: true,
          editedAt: updated.editedAt,
          updatedAt: updated.updatedAt,
        });
      } catch (err) {
        console.error('message:edit error:', err);
        socket.emit('message:error', { error: 'Failed to edit message' });
      }
    });

    socket.on('message:delete', async ({ messageId, mode = 'everyone' }) => {
      try {
        if (!messageId)
          return socket.emit('message:error', { error: 'messageId is required' });

        const existing = await prisma.message.findUnique({ where: { id: messageId } });
        if (!existing) return socket.emit('message:error', { error: 'Message not found' });

        const conv = await prisma.conversation.findUnique({ where: { id: existing.conversationId } });
        if (!conv) return socket.emit('message:error', { error: 'Conversation not found' });
        if (conv.user1Id !== user.id && conv.user2Id !== user.id)
          return socket.emit('message:error', { error: 'Access denied' });

        if (mode === 'me') {
          // Delete only for the requesting user — others still see the message
          await prisma.messageDeletion.upsert({
            where: { messageId_userId: { messageId: existing.id, userId: user.id } },
            update: {},
            create: { messageId: existing.id, userId: user.id },
          });
          socket.emit('message:deleted', {
            id: existing.id,
            conversationId: existing.conversationId,
            mode: 'me',
          });
        } else {
          // Delete for everyone — hard delete from DB and notify all users
          await prisma.messageDeletion.deleteMany({ where: { messageId: existing.id } });
          await prisma.message.delete({ where: { id: existing.id } });

          io.to(existing.conversationId).emit('message:deleted', {
            id: existing.id,
            conversationId: existing.conversationId,
            mode: 'everyone',
          });
        }
      } catch (err) {
        console.error('message:delete error:', err);
        socket.emit('message:error', { error: 'Failed to delete message' });
      }
    });

    socket.on('message:react', async ({ messageId, emoji }) => {
      try {
        if (!messageId || !emoji)
          return socket.emit('message:error', { error: 'messageId and emoji are required' });

        const existing = await prisma.message.findUnique({ where: { id: messageId } });
        if (!existing) return socket.emit('message:error', { error: 'Message not found' });

        const conv = await prisma.conversation.findUnique({ where: { id: existing.conversationId } });
        if (!conv) return socket.emit('message:error', { error: 'Conversation not found' });
        if (conv.user1Id !== user.id && conv.user2Id !== user.id)
          return socket.emit('message:error', { error: 'Access denied' });

        const reaction = await prisma.messageReaction.upsert({
          where: { messageId_userId_emoji: { messageId, userId: user.id, emoji } },
          update: {},
          create: { messageId, userId: user.id, emoji },
          include: { user: { select: { id: true, username: true, avatar: true } } },
        });

        io.to(existing.conversationId).emit('message:reaction', {
          messageId,
          conversationId: existing.conversationId,
          reaction,
        });
      } catch (err) {
        console.error('message:react error:', err);
        socket.emit('message:error', { error: 'Failed to add reaction' });
      }
    });

    socket.on('message:unreact', async ({ messageId, emoji }) => {
      try {
        if (!messageId || !emoji)
          return socket.emit('message:error', { error: 'messageId and emoji are required' });

        const existing = await prisma.message.findUnique({ where: { id: messageId } });
        if (!existing) return socket.emit('message:error', { error: 'Message not found' });

        const conv = await prisma.conversation.findUnique({ where: { id: existing.conversationId } });
        if (!conv) return socket.emit('message:error', { error: 'Conversation not found' });
        if (conv.user1Id !== user.id && conv.user2Id !== user.id)
          return socket.emit('message:error', { error: 'Access denied' });

        await prisma.messageReaction.deleteMany({ where: { messageId, userId: user.id, emoji } });

        io.to(existing.conversationId).emit('message:unreaction', {
          messageId,
          conversationId: existing.conversationId,
          userId: user.id,
          emoji,
        });
      } catch (err) {
        console.error('message:unreact error:', err);
        socket.emit('message:error', { error: 'Failed to remove reaction' });
      }
    });

    socket.on('typing:start', async ({ conversationId }) => {
      if (!conversationId) return;
      await prisma.typingStatus.upsert({
        where: { userId: user.id },
        update: { isTyping: true },
        create: { userId: user.id, isTyping: true },
      }).catch(() => {});
      socket.to(conversationId).emit('typing:update', {
        conversationId, userId: user.id, username: user.username, isTyping: true,
      });
    });

    socket.on('typing:stop', async ({ conversationId }) => {
      if (!conversationId) return;
      await prisma.typingStatus.updateMany({ where: { userId: user.id }, data: { isTyping: false } })
        .catch(() => {});
      socket.to(conversationId).emit('typing:update', {
        conversationId, userId: user.id, username: user.username, isTyping: false,
      });
    });

    socket.on('message:read', async ({ messageId, conversationId }) => {
      try {
        await prisma.message.update({ where: { id: messageId }, data: { isRead: true } });
        await prisma.readReceipt.upsert({
          where: { messageId_userId: { messageId, userId: user.id } },
          update: {},
          create: { messageId, userId: user.id },
        });
        socket.to(conversationId).emit('message:read', { messageId, userId: user.id, readAt: new Date() });
      } catch (err) {
        console.error('message:read error:', err);
      }
    });

    // ============== CALL RELATED EVENTS ==============

    // Handle call initiation
    socket.on('call:initiate', async ({ conversationId, callType = 'audio' }) => {
      try {
        console.log(`Call initiated: ${user.username} -> conversation ${conversationId} (${callType})`);

        const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (!conv) return socket.emit('call:error', { error: 'Conversation not found' });
        if (conv.user1Id !== user.id && conv.user2Id !== user.id)
          return socket.emit('call:error', { error: 'Access denied' });

        const receiverId = conv.user1Id === user.id ? conv.user2Id : conv.user1Id;
        if (!receiverId || receiverId === user.id) {
          return socket.emit('call:error', { error: 'You cannot call yourself' });
        }

        // Calls left behind by a closed tab must not block a new call forever.
        const staleRingingBefore = new Date(Date.now() - 60 * 1000);
        const staleInProgressBefore = new Date(Date.now() - 12 * 60 * 60 * 1000);
        await prisma.call.updateMany({
          where: {
            status: 'ringing',
            createdAt: { lt: staleRingingBefore },
            OR: [
              { callerId: user.id },
              { callerId: receiverId },
              { participants: { some: { userId: user.id } } },
              { participants: { some: { userId: receiverId } } },
            ],
          },
          data: { status: 'missed', endedAt: new Date() },
        });
        await prisma.call.updateMany({
          where: {
            status: 'in-progress',
            updatedAt: { lt: staleInProgressBefore },
            OR: [
              { callerId: user.id },
              { callerId: receiverId },
              { participants: { some: { userId: user.id } } },
              { participants: { some: { userId: receiverId } } },
            ],
          },
          data: { status: 'ended', endedAt: new Date() },
        });

        // Check if user is already in a call
        const existingActiveCall = await prisma.call.findFirst({
          where: {
            OR: [
              { callerId: user.id, status: { in: ['ringing', 'in-progress'] } },
              { participants: { some: { userId: user.id } }, status: 'in-progress' }
            ]
          }
        });

        if (existingActiveCall) {
          return socket.emit('call:error', { error: 'You are already in a call' });
        }

        // Check if receiver is already in a call
        const receiverActiveCall = await prisma.call.findFirst({
          where: {
            OR: [
              { callerId: receiverId, status: { in: ['ringing', 'in-progress'] } },
              { participants: { some: { userId: receiverId } }, status: 'in-progress' }
            ]
          }
        });

        if (receiverActiveCall) {
          return socket.emit('call:error', { error: 'User is currently in another call' });
        }

        // Create call record
        const call = await prisma.call.create({
          data: {
            conversationId,
            callerId: user.id,
            callType,
            status: 'ringing'
          },
          include: {
            caller: { select: { id: true, username: true, avatar: true } },
            conversation: true
          }
        });

        // Add caller as participant
        await prisma.callParticipant.create({
          data: {
            callId: call.id,
            userId: user.id,
            joinedAt: new Date(),
            hasVideo: callType === 'video'
          }
        });

        // Notify receiver
        const receiverSocket = activeUsers.get(receiverId);
        if (receiverSocket) {
          io.to(receiverSocket.socketId).emit('call:incoming', {
            callId: call.id,
            conversationId,
            caller: call.caller,
            callType,
            timestamp: new Date()
          });
        } else {
          // Receiver is offline - mark call as missed
          await prisma.call.update({
            where: { id: call.id },
            data: { status: 'missed', endedAt: new Date() }
          });
        }

        socket.emit('call:initiated', {
          callId: call.id,
          callerId: user.id,
          conversationId,
          callType,
          timestamp: new Date()
        });

      } catch (err) {
        console.error('call:initiate error:', err);
        socket.emit('call:error', { error: 'Failed to initiate call' });
      }
    });

    // Handle call acceptance
    socket.on('call:accept', async ({ callId }) => {
      try {
        console.log(`Call accepted: ${user.username} -> call ${callId}`);

        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: { caller: true, conversation: true }
        });

        if (!call) return socket.emit('call:error', { error: 'Call not found' });
        if (call.status !== 'ringing') return socket.emit('call:error', { error: 'Call is no longer ringing' });

        // Verify user is part of conversation
        if (call.conversation.user1Id !== user.id && call.conversation.user2Id !== user.id)
          return socket.emit('call:error', { error: 'Access denied' });

        // Update call status
        await prisma.call.update({
          where: { id: callId },
          data: { status: 'in-progress' }
        });

        // Add user as participant
        await prisma.callParticipant.create({
          data: {
            callId: call.id,
            userId: user.id,
            joinedAt: new Date(),
            hasVideo: call.callType === 'video'
          }
        });

        // Notify caller
        const callerSocket = activeUsers.get(call.callerId);
        if (callerSocket) {
          io.to(callerSocket.socketId).emit('call:accepted', {
            callId: call.id,
            conversationId: call.conversationId,
            participant: {
              id: user.id,
              username: user.username,
              avatar: user.avatar
            },
            timestamp: new Date()
          });
        }

        // Notify user
        socket.emit('call:accepted', {
          callId: call.id,
          conversationId: call.conversationId,
          callType: call.callType,
          timestamp: new Date()
        });

      } catch (err) {
        console.error('call:accept error:', err);
        socket.emit('call:error', { error: 'Failed to accept call' });
      }
    });

    // Handle call rejection
    socket.on('call:reject', async ({ callId }) => {
      try {
        console.log(`Call rejected: ${user.username} -> call ${callId}`);

        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: { caller: true }
        });

        if (!call) return socket.emit('call:error', { error: 'Call not found' });
        if (call.status !== 'ringing') return socket.emit('call:error', { error: 'Call is no longer ringing' });

        // Update call status
        await prisma.call.update({
          where: { id: callId },
          data: { status: 'rejected', endedAt: new Date() }
        });

        // Notify caller
        const callerSocket = activeUsers.get(call.callerId);
        if (callerSocket) {
          io.to(callerSocket.socketId).emit('call:rejected', {
            callId: call.id,
            timestamp: new Date(),
            reason: 'rejected'
          });
        }

        socket.emit('call:rejected', {
          callId: call.id,
          timestamp: new Date()
        });

      } catch (err) {
        console.error('call:reject error:', err);
        socket.emit('call:error', { error: 'Failed to reject call' });
      }
    });

    // Handle call end
    socket.on('call:end', async ({ callId }) => {
      try {
        console.log(`Call ended: ${user.username} -> call ${callId}`);

        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: { participants: true, conversation: true }
        });

        if (!call) return socket.emit('call:error', { error: 'Call not found' });
        if (call.callerId !== user.id && !call.participants.some(participant => participant.userId === user.id)) {
          return socket.emit('call:error', { error: 'Access denied' });
        }

        // Update call status
        await prisma.call.update({
          where: { id: callId },
          data: { status: 'ended', endedAt: new Date() }
        });

        // Update participant left time
        await prisma.callParticipant.updateMany({
          where: { callId: call.id, userId: user.id, leftAt: null },
          data: { leftAt: new Date() }
        });

        // Notify all participants
        call.participants.forEach(participant => {
          const participantSocket = activeUsers.get(participant.userId);
          if (participantSocket && participant.userId !== user.id) {
            io.to(participantSocket.socketId).emit('call:ended', {
              callId: call.id,
              endedBy: user.id,
              timestamp: new Date()
            });
          }
        });

        const otherUserId = call.conversation.user1Id === user.id
          ? call.conversation.user2Id
          : call.conversation.user1Id;
        const otherSocket = otherUserId ? activeUsers.get(otherUserId) : null;
        if (otherSocket && otherUserId !== user.id) {
          io.to(otherSocket.socketId).emit('call:ended', {
            callId: call.id,
            endedBy: user.id,
            timestamp: new Date()
          });
        }

        socket.emit('call:ended', {
          callId: call.id,
          timestamp: new Date()
        });

      } catch (err) {
        console.error('call:end error:', err);
        socket.emit('call:error', { error: 'Failed to end call' });
      }
    });

    // Handle WebRTC signaling
    socket.on('webrtc:signal', async ({ callId, signalType, signalData }) => {
      try {
        console.log(`WebRTC signal: ${user.username} -> ${signalType}`);

        const call = await prisma.call.findUnique({
          where: { id: callId },
          include: { participants: true }
        });

        if (!call) return socket.emit('webrtc:error', { error: 'Call not found' });
        if (call.status !== 'in-progress') return socket.emit('webrtc:error', { error: 'Call is not in progress' });

        // Store signal in database (optional, for debugging/analytics)
        await prisma.webRTCSignal.create({
          data: {
            callId,
            senderId: user.id,
            signalType,
            signalData: JSON.stringify(signalData)
          }
        });

        // Relay signal to other participants
        call.participants.forEach(participant => {
          if (participant.userId !== user.id) {
            const participantSocket = activeUsers.get(participant.userId);
            if (participantSocket) {
              io.to(participantSocket.socketId).emit('webrtc:signal', {
                callId,
                senderId: user.id,
                signalType,
                signalData,
                timestamp: new Date()
              });
            }
          }
        });

      } catch (err) {
        console.error('webrtc:signal error:', err);
        socket.emit('webrtc:error', { error: 'Failed to send signal' });
      }
    });

    socket.on('disconnect', async () => {
      console.log(`Disconnected: ${user.username} (${user.id})`);
      const currentConnection = activeUsers.get(user.id);
      if (!currentConnection || currentConnection.socketId !== socket.id) return;
      activeUsers.delete(user.id);
      const userCalls = await prisma.call.findMany({
        where: {
          status: { in: ['ringing', 'in-progress'] },
          OR: [
            { callerId: user.id },
            { participants: { some: { userId: user.id } } },
          ],
        },
        include: { participants: true, conversation: true },
      });
      for (const call of userCalls) {
        await prisma.call.update({
          where: { id: call.id },
          data: { status: 'ended', endedAt: new Date() },
        });
        const otherUserId = call.conversation.user1Id === user.id
          ? call.conversation.user2Id
          : call.conversation.user1Id;
        const otherSocket = activeUsers.get(otherUserId);
        if (otherSocket) {
          io.to(otherSocket.socketId).emit('call:ended', {
            callId: call.id,
            endedBy: user.id,
            timestamp: new Date(),
          });
        }
      }
      const lastSeen = new Date();
      await prisma.user.update({ where: { id: user.id }, data: { isOnline: false, lastSeen } })
        .catch((err) => console.error('Offline status update error:', err));
      await prisma.typingStatus.update({ where: { userId: user.id }, data: { isTyping: false } })
        .catch(() => {});
      io.emit('user:online', { userId: user.id, isOnline: false, lastSeen });
    });

    // Notification acknowledgment
    socket.on('notification:acknowledge', async ({ notificationId }) => {
      try {
        const notification = await prisma.notification.findFirst({
          where: { id: notificationId, userId: user.id }
        });

        if (notification && !notification.isRead) {
          await prisma.notification.update({
            where: { id: notificationId },
            data: { isRead: true }
          });
        }
      } catch (err) {
        console.error('notification:acknowledge error:', err);
      }
    });
  });
};

module.exports = { initializeSocket, activeUsers, broadcastUserUpdate, broadcastUserDeleted };
