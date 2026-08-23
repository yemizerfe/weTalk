const prisma = require('../config/db');
const { authenticate } = require('../middleware/auth');

class CallController {
  // Get call history for a conversation
  static async getCallHistory(req, res) {
    try {
      const { conversationId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      // Verify user has access to this conversation
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId }
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (conversation.user1Id !== req.user.id && conversation.user2Id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get calls for this conversation
      const calls = await prisma.call.findMany({
        where: { conversationId },
        include: {
          caller: {
            select: { id: true, username: true, avatar: true }
          },
          participants: {
            include: {
              user: {
                select: { id: true, username: true, avatar: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset)
      });

      // Get total count for pagination
      const total = await prisma.call.count({
        where: { conversationId }
      });

      res.json({
        calls,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + calls.length) < total
        }
      });

    } catch (error) {
      console.error('Get call history error:', error);
      res.status(500).json({ error: 'Failed to get call history' });
    }
  }

  // Get recent calls for user (across all conversations)
  static async getRecentCalls(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 20 } = req.query;

      // Get conversations where user is a participant
      const userConversations = await prisma.conversation.findMany({
        where: {
          OR: [
            { user1Id: userId },
            { user2Id: userId }
          ]
        },
        select: { id: true }
      });

      const conversationIds = userConversations.map(c => c.id);

      // Get recent calls from user's conversations
      const calls = await prisma.call.findMany({
        where: {
          conversationId: { in: conversationIds }
        },
        include: {
          conversation: {
            include: {
              user1: { select: { id: true, username: true, avatar: true } },
              user2: { select: { id: true, username: true, avatar: true } }
            }
          },
          caller: {
            select: { id: true, username: true, avatar: true }
          },
          participants: {
            include: {
              user: {
                select: { id: true, username: true, avatar: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit)
      });

      // Format response to include participant info
      const formattedCalls = calls.map(call => {
        const otherUser = call.conversation.user1Id === userId ? 
          call.conversation.user2 : call.conversation.user1;

        return {
          id: call.id,
          conversationId: call.conversationId,
          callType: call.callType,
          status: call.status,
          startedAt: call.startedAt,
          endedAt: call.endedAt,
          duration: call.endedAt && call.startedAt ? 
            Math.floor((call.endedAt - call.startedAt) / 1000) : null,
          caller: call.caller,
          otherUser,
          participants: call.participants,
          createdAt: call.createdAt
        };
      });

      res.json({ calls: formattedCalls });

    } catch (error) {
      console.error('Get recent calls error:', error);
      res.status(500).json({ error: 'Failed to get recent calls' });
    }
  }

  // Get call details
  static async getCallDetails(req, res) {
    try {
      const { callId } = req.params;

      const call = await prisma.call.findUnique({
        where: { id: callId },
        include: {
          conversation: true,
          caller: {
            select: { id: true, username: true, avatar: true }
          },
          participants: {
            include: {
              user: {
                select: { id: true, username: true, avatar: true }
              }
            }
          }
        }
      });

      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Verify user has access to this call's conversation
      if (call.conversation.user1Id !== req.user.id && call.conversation.user2Id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json({ call });

    } catch (error) {
      console.error('Get call details error:', error);
      res.status(500).json({ error: 'Failed to get call details' });
    }
  }

  // Get call statistics
  static async getCallStats(req, res) {
    try {
      const userId = req.user.id;

      // Get user's conversations
      const userConversations = await prisma.conversation.findMany({
        where: {
          OR: [
            { user1Id: userId },
            { user2Id: userId }
          ]
        },
        select: { id: true }
      });

      const conversationIds = userConversations.map(c => c.id);

      // Get stats
      const [
        totalCalls,
        totalDuration,
        callsByType,
        callsByStatus,
        recentCalls
      ] = await Promise.all([
        // Total calls
        prisma.call.count({
          where: { conversationId: { in: conversationIds } }
        }),

        // Total duration (in seconds)
        prisma.call.aggregate({
          where: {
            conversationId: { in: conversationIds },
            endedAt: { not: null },
            startedAt: { not: null }
          },
          _sum: {
            _duration: {
              $expr: {
                $divide: [
                  { $subtract: ['$endedAt', '$startedAt'] },
                  1000
                ]
              }
            }
          }
        }),

        // Calls by type
        prisma.call.groupBy({
          where: { conversationId: { in: conversationIds } },
          by: ['callType'],
          _count: true
        }),

        // Calls by status
        prisma.call.groupBy({
          where: { conversationId: { in: conversationIds } },
          by: ['status'],
          _count: true
        }),

        // Recent calls for activity
        prisma.call.findMany({
          where: { conversationId: { in: conversationIds } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            conversation: {
              include: {
                user1: { select: { username: true } },
                user2: { select: { username: true } }
              }
            }
          }
        })
      ]);

      res.json({
        totalCalls,
        totalDuration: Math.floor(totalDuration._sum._duration || 0),
        callsByType: callsByType.reduce((acc, curr) => ({
          ...acc,
          [curr.callType]: curr._count
        }), {}),
        callsByStatus: callsByStatus.reduce((acc, curr) => ({
          ...acc,
          [curr.status]: curr._count
        }), {}),
        recentActivity: recentCalls.map(call => ({
          id: call.id,
          callType: call.callType,
          status: call.status,
          duration: call.endedAt && call.startedAt ? 
            Math.floor((call.endedAt - call.startedAt) / 1000) : null,
          createdAt: call.createdAt
        }))
      });

    } catch (error) {
      console.error('Get call stats error:', error);
      res.status(500).json({ error: 'Failed to get call statistics' });
    }
  }

  // Get missed calls count
  static async getMissedCallsCount(req, res) {
    try {
      const userId = req.user.id;

      // Get user's conversations
      const userConversations = await prisma.conversation.findMany({
        where: {
          OR: [
            { user1Id: userId },
            { user2Id: userId }
          ]
        },
        select: { id: true }
      });

      const conversationIds = userConversations.map(c => c.id);

      // Count missed calls where user was not the caller
      const missedCount = await prisma.call.count({
        where: {
          conversationId: { in: conversationIds },
          status: 'missed',
          callerId: { not: userId }
        }
      });

      res.json({ missedCount });

    } catch (error) {
      console.error('Get missed calls count error:', error);
      res.status(500).json({ error: 'Failed to get missed calls count' });
    }
  }
}

module.exports = CallController;