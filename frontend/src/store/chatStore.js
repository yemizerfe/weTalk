import { create } from 'zustand'
import { io } from 'socket.io-client'
import { playMessageSound, showMessageNotification, useSettingsStore } from './settingsStore'
import { useAuthStore } from './authStore'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001'

export const useChatStore = create((set, get) => ({
  socket: null,
  conversations: [],
  activeConversation: null,
  messages: {},
  typingUsers: {},
  onlineUsers: [],
  unreadCounts: {},
  callError: null,

  // ============== CALL STATE ==============
  activeCall: null,
  incomingCall: null,
  callRole: null, // 'caller' | 'callee'
  callStatus: 'idle', // 'idle', 'ringing', 'in-progress', 'ending'
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  isMuted: false,
  isVideoEnabled: false,
  handleWebRTCSignal: null,
  pendingWebRTCSignals: [],

  initializeSocket: () => {
    const existingSocket = get().socket
    if (existingSocket && existingSocket.connected) return // already connected

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    })

    socket.on('connect', () => {
      console.log('Connected to socket server')
    })

    socket.on('disconnect', () => {
      console.log('Disconnected from socket server')
    })

    socket.on('message:new', (message) => {
      const { activeConversation, messages } = get()
      const currentUser = useAuthStore.getState().user
      const isOwn = message.senderId === currentUser?.id

      if (activeConversation && message.conversationId === activeConversation.id) {
        const existing = messages[activeConversation.id] || []

        // Try to find a temp optimistic message that matches and replace it
        const tempIndex = existing.findIndex(m => String(m.id).startsWith('temp-') && m.senderId === message.senderId && m.content === message.content)
        if (tempIndex >= 0) {
          const newMsgs = [...existing]
          newMsgs[tempIndex] = message
          set({ messages: { ...messages, [activeConversation.id]: newMsgs } })
        } else if (!existing.find(m => m.id === message.id)) {
          set({ messages: { ...messages, [activeConversation.id]: [...existing, message] } })
        }

        // A message arriving in the already-open conversation is read immediately.
        if (!isOwn && !message.isRead && useSettingsStore.getState().readReceipts) {
          get().markAsRead(message.id, message.conversationId)
        }
      }

      if (!isOwn) {
        if (!activeConversation || activeConversation.id !== message.conversationId) {
          set(state => ({
            unreadCounts: {
              ...state.unreadCounts,
              [message.conversationId]: (state.unreadCounts[message.conversationId] || 0) + 1,
            },
          }))
        }
        playMessageSound()
        const notificationBody = message.messageType === 'audio'
          ? 'Voice message'
          : message.messageType === 'image'
            ? '📷 Photo'
            : message.messageType === 'video'
              ? '🎥 Video'
              : message.messageType === 'file'
                ? '📎 File'
                : message.content
        showMessageNotification(
          message.sender?.username || 'New message',
          notificationBody
        )
      }

      get().updateConversationLastMessage(message)
    })

    socket.on('message:edited', (data) => {
      const { messages, activeConversation } = get()
      if (!activeConversation || data.conversationId !== activeConversation.id) return
      const conversationMessages = messages[activeConversation.id] || []
      const updatedMessages = conversationMessages.map(msg =>
        msg.id === data.id ? { ...msg, content: data.content, isEdited: true, editedAt: data.editedAt } : msg
      )
      set({
        messages: {
          ...messages,
          [activeConversation.id]: updatedMessages
        }
      })
    })

    socket.on('message:deleted', (data) => {
      const { messages, activeConversation } = get()
      if (!activeConversation || data.conversationId !== activeConversation.id) return
      // 'me' mode removes the message only for the requesting user (already handled optimistically).
      // 'everyone' mode removes it for all users in the conversation.
      const conversationMessages = messages[activeConversation.id] || []
      const updatedMessages = conversationMessages.filter(msg => msg.id !== data.id)
      set({
        messages: {
          ...messages,
          [activeConversation.id]: updatedMessages
        }
      })
    })

    socket.on('message:reaction', (data) => {
      const { messages, activeConversation } = get()
      if (!activeConversation || data.conversationId !== activeConversation.id) return
      const conversationMessages = messages[activeConversation.id] || []
      const updatedMessages = conversationMessages.map(msg => {
        if (msg.id !== data.messageId) return msg
        const existingReaction = (msg.reactions || []).find(reaction =>
          reaction.userId === data.reaction.userId && reaction.emoji === data.reaction.emoji
        )
        const reactions = existingReaction
          ? (msg.reactions || []).map(reaction => (
            reaction.id?.startsWith('temp-') &&
            reaction.userId === data.reaction.userId &&
            reaction.emoji === data.reaction.emoji
              ? data.reaction
              : reaction
          ))
          : [...(msg.reactions || []), data.reaction]
        return { ...msg, reactions }
      })
      set({
        messages: {
          ...messages,
          [activeConversation.id]: updatedMessages
        }
      })
    })

    socket.on('message:unreaction', (data) => {
      const { messages, activeConversation } = get()
      if (!activeConversation || data.conversationId !== activeConversation.id) return
      const conversationMessages = messages[activeConversation.id] || []
      const updatedMessages = conversationMessages.map(msg => {
        if (msg.id !== data.messageId) return msg
        const reactions = (msg.reactions || []).filter(r =>
          !(r.userId === data.userId && r.emoji === data.emoji)
        )
        return { ...msg, reactions }
      })
      set({
        messages: {
          ...messages,
          [activeConversation.id]: updatedMessages
        }
      })
    })

    socket.on('message:read', (data) => {
      const { messages, activeConversation } = get()
      
      if (activeConversation) {
        const conversationMessages = messages[activeConversation.id] || []
        const updatedMessages = conversationMessages.map(msg => 
          msg.id === data.messageId ? { ...msg, isRead: true } : msg
        )
        
        set({
          messages: {
            ...messages,
            [activeConversation.id]: updatedMessages
          }
        })
      }
    })

    socket.on('typing:update', (data) => {
      const { typingUsers } = get()
      
      if (data.isTyping) {
        set({
          typingUsers: {
            ...typingUsers,
            [data.conversationId]: data
          }
        })
      } else {
        const newTypingUsers = { ...typingUsers }
        delete newTypingUsers[data.conversationId]
        set({ typingUsers: newTypingUsers })
      }
    })

    socket.on('user:online', (data) => {
      get().updateUserPresence(data)
    })

    socket.on('users:active', (users) => {
      set({ onlineUsers: users })
      users.forEach(user => get().updateUserPresence(user))
    })

    socket.on('user:updated', (user) => {
      get().updateUserProfile(user)
    })

    socket.on('user:deleted', ({ userId, lastSeen }) => {
      get().updateUserProfile({
        id: userId,
        username: 'Deleted account',
        avatar: null,
        isOnline: false,
        lastSeen,
      })
    })

    socket.on('conversation:updated', (data) => {
      get().updateConversationLastMessage(data)
    })

    set({ socket })

    // Register immediately so a fast incoming call cannot arrive before listeners exist.
    get().initializeCallSocket()
  },

  disconnectSocket: () => {
    const { socket } = get()
    if (socket) {
      socket.disconnect()
      set({ socket: null })
    }
  },

  resetChatSession: () => {
    get().cleanupCallMedia()
    set({
      conversations: [],
      activeConversation: null,
      messages: {},
      typingUsers: {},
      onlineUsers: [],
      unreadCounts: {},
      activeCall: null,
      incomingCall: null,
      callRole: null,
      callStatus: 'idle',
      callError: null,
    })
  },

  joinConversation: (conversationId) => {
    const { socket } = get()
    if (socket) {
      socket.emit('conversation:join', conversationId)
    }
  },

  leaveConversation: (conversationId) => {
    const { socket } = get()
    if (socket) {
      socket.emit('conversation:leave', conversationId)
    }
  },

  sendMessage: (conversationId, content, messageType = 'text') => {
    const { socket } = get()
    if (socket) {
      socket.emit('message:send', { conversationId, content, messageType })
    }
  },

  startTyping: (conversationId) => {
    const { socket } = get()
    if (socket) {
      socket.emit('typing:start', { conversationId })
    }
  },

  stopTyping: (conversationId) => {
    const { socket } = get()
    if (socket) {
      socket.emit('typing:stop', { conversationId })
    }
  },

  markAsRead: (messageId, conversationId) => {
    const { socket } = get()
    if (socket) {
      socket.emit('message:read', { messageId, conversationId })
    }
  },

  editMessage: (conversationId, messageId, content) => {
    const { socket } = get()
    if (socket) {
      socket.emit('message:edit', { messageId, content })
    }
    // Optimistic update
    const { messages } = get()
    const conversationMessages = messages[conversationId] || []
    const updatedMessages = conversationMessages.map(msg =>
      msg.id === messageId ? { ...msg, content, isEdited: true, editedAt: new Date().toISOString() } : msg
    )
    set({
      messages: {
        ...messages,
        [conversationId]: updatedMessages
      }
    })
  },

  deleteMessage: (conversationId, messageId, mode = 'everyone') => {
    const { socket } = get()
    if (socket) {
      socket.emit('message:delete', { messageId, mode })
    }
    // Optimistic update — remove from our view immediately.
    // For 'everyone', the socket event removes it for all users.
    // For 'me', the backend also sends a 'message:deleted' back to this user.
    const { messages } = get()
    const conversationMessages = messages[conversationId] || []
    const updatedMessages = conversationMessages.filter(msg => msg.id !== messageId)
    set({
      messages: {
        ...messages,
        [conversationId]: updatedMessages
      }
    })
  },

  reactToMessage: (conversationId, messageId, emoji) => {
    const { socket, messages } = get()
    const currentUser = useAuthStore.getState().user
    if (socket) {
      socket.emit('message:react', { messageId, emoji })
    }
    // Optimistic update
    const conversationMessages = messages[conversationId] || []
    const updatedMessages = conversationMessages.map(msg => {
      if (msg.id !== messageId) return msg
      const existing = (msg.reactions || []).find(r => r.userId === currentUser?.id && r.emoji === emoji)
      if (existing) return msg // already reacted
      return { ...msg, reactions: [...(msg.reactions || []), { id: `temp-${Date.now()}`, messageId, userId: currentUser?.id, emoji, createdAt: new Date().toISOString() }] }
    })
    set({
      messages: {
        ...messages,
        [conversationId]: updatedMessages
      }
    })
  },

  unreactToMessage: (conversationId, messageId, emoji) => {
    const { socket, messages } = get()
    const currentUser = useAuthStore.getState().user
    if (socket) {
      socket.emit('message:unreact', { messageId, emoji })
    }
    // Optimistic update
    const conversationMessages = messages[conversationId] || []
    const updatedMessages = conversationMessages.map(msg => {
      if (msg.id !== messageId) return msg
      const reactions = (msg.reactions || []).filter(r => !(r.userId === currentUser?.id && r.emoji === emoji))
      return { ...msg, reactions }
    })
    set({
      messages: {
        ...messages,
        [conversationId]: updatedMessages
      }
    })
  },

  setConversations: (conversations) => set((state) => {
    const mergedConversations = conversations.map(conversation => {
      const livePresence = state.onlineUsers.find(user => String(user.id) === String(conversation.otherUser?.id))
      return livePresence
        ? { ...conversation, otherUser: { ...conversation.otherUser, ...livePresence } }
        : conversation
    })
    return { conversations: mergedConversations }
  }),
  
  setActiveConversation: (conversation) => {
    const { activeConversation, joinConversation, leaveConversation, unreadCounts } = get()
    
    if (activeConversation && activeConversation.id !== conversation?.id) {
      leaveConversation(activeConversation.id)
    }
    
    if (conversation) {
      joinConversation(conversation.id)
    }
    
    const nextUnreadCounts = { ...unreadCounts }
    if (conversation) delete nextUnreadCounts[conversation.id]
    set({ activeConversation: conversation, unreadCounts: nextUnreadCounts })
  },

  setMessages: (conversationId, messages) => {
    const { messages: currentMessages } = get()
    set({
      messages: {
        ...currentMessages,
        [conversationId]: messages
      }
    })
  },

  addMessage: (conversationId, message) => {
    const { messages } = get()
    set({
      messages: {
        ...messages,
        [conversationId]: [...(messages[conversationId] || []), message]
      }
    })
  },

  updateConversationLastMessage: (data) => {
    const { conversations } = get()
    // data can be a message object or { conversationId, lastMessage }
    const convId = data.conversationId
    const lastMessage = data.lastMessage || data
    let found = false
    const updatedConversations = conversations.map(conv => {
      if (conv.id !== convId) return conv
      found = true
      return { ...conv, lastMessage, updatedAt: lastMessage.createdAt || conv.updatedAt }
    })
    if (!found && data.otherUser) {
      updatedConversations.push({
        id: convId,
        otherUser: data.otherUser,
        lastMessage,
        createdAt: lastMessage.createdAt,
        updatedAt: lastMessage.createdAt,
      })
    }
    updatedConversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    set({ conversations: updatedConversations })
  },

  setOnlineUsers: (users) => set({ onlineUsers: users }),
  setPresence: (isOnline) => {
    const { socket } = get()
    if (socket) socket.emit('presence:update', { isOnline })
  },
  clearCallError: () => set({ callError: null }),
  clearUnread: (conversationId) => set(state => {
    const unreadCounts = { ...state.unreadCounts }
    delete unreadCounts[conversationId]
    return { unreadCounts }
  }),

  updateUserInConversations: (userData) => set((state) => ({
    conversations: state.conversations.map(conversation => (
      String(conversation.otherUser?.id) === String(userData.id)
        ? { ...conversation, otherUser: { ...conversation.otherUser, ...userData } }
        : conversation
    )),
    activeConversation: state.activeConversation && String(state.activeConversation.otherUser?.id) === String(userData.id)
      ? { ...state.activeConversation, otherUser: { ...state.activeConversation.otherUser, ...userData } }
      : state.activeConversation,
  })),

  updateUserProfile: (userData) => set((state) => ({
    onlineUsers: state.onlineUsers.some(user => String(user.id) === String(userData.id))
      ? state.onlineUsers.map(user => (
        String(user.id) === String(userData.id) ? { ...user, ...userData } : user
      ))
      : [...state.onlineUsers, userData],
    conversations: state.conversations.map(conversation => (
      String(conversation.otherUser?.id) === String(userData.id)
        ? { ...conversation, otherUser: { ...conversation.otherUser, ...userData } }
        : conversation
    )),
    activeConversation: state.activeConversation && String(state.activeConversation.otherUser?.id) === String(userData.id)
      ? { ...state.activeConversation, otherUser: { ...state.activeConversation.otherUser, ...userData } }
      : state.activeConversation,
  })),

  broadcastProfileUpdate: (userData) => {
    const { socket } = get()
    if (socket) socket.emit('profile:update', { username: userData.username, avatar: userData.avatar })
  },

  updateUserPresence: ({ userId, id, isOnline, lastSeen }) => set((state) => {
    const presenceId = userId || id
    const existingIndex = state.onlineUsers.findIndex(user => String(user.id) === String(presenceId))
    const presence = { id: presenceId, isOnline: !!isOnline, ...(lastSeen ? { lastSeen } : {}) }
    const onlineUsers = existingIndex >= 0
      ? state.onlineUsers.map((user, index) => index === existingIndex ? { ...user, ...presence } : user)
      : [...state.onlineUsers, presence]
    const conversations = state.conversations.map(conversation => (
      String(conversation.otherUser?.id) === String(presenceId)
        ? { ...conversation, otherUser: { ...conversation.otherUser, ...presence } }
        : conversation
    ))
    const activeConversation = state.activeConversation && String(state.activeConversation.otherUser?.id) === String(presenceId)
      ? { ...state.activeConversation, otherUser: { ...state.activeConversation.otherUser, ...presence } }
      : state.activeConversation
    return { onlineUsers, conversations, activeConversation }
  }),
  
  setTypingUsers: (typingUsers) => set({ typingUsers }),

  // ============== CALL FUNCTIONALITY ==============

  // Initialize socket with call event listeners
  initializeCallSocket: () => {
    const socket = get().socket
    if (!socket) {
      console.warn('Socket not initialized for call events')
      return
    }

    // Call initiation response
    socket.on('call:initiated', (data) => {
      console.log('Call initiated:', data)
      set({ 
        activeCall: data,
        callRole: 'caller',
        callStatus: 'ringing'
      })
    })

    // Incoming call notification
    socket.on('call:incoming', (data) => {
      console.log('Incoming call:', data)
      set({ 
        incomingCall: data,
        callRole: 'callee',
        callStatus: 'ringing'
      })
      
      // Play ringtone (optional)
      // playRingtone()
    })

    // Call accepted notification
    socket.on('call:accepted', (data) => {
      console.log('Call accepted:', data)
      const { activeCall, incomingCall } = get()
      
      // If we're the caller, the call is now in-progress
      if (activeCall && activeCall.callId === data.callId) {
        set({ 
          callStatus: 'in-progress'
        })
      }
      
      // If we're the callee, remove incoming call & set active
      if (incomingCall && incomingCall.callId === data.callId) {
        set({ 
          activeCall: incomingCall,
          incomingCall: null,
          callStatus: 'in-progress'
        })
      }
    })

    // Call rejected notification
    socket.on('call:rejected', (data) => {
      console.log('Call rejected:', data)
      const { activeCall, incomingCall } = get()
      
      // Caller side
      if (activeCall && activeCall.callId === data.callId) {
        set({ 
          activeCall: null,
          callStatus: 'idle'
        })
      }
      
      // Callee side - they rejected themselves
      if (incomingCall && incomingCall.callId === data.callId) {
        set({ 
          incomingCall: null,
          callStatus: 'idle'
        })
      }
      
      get().cleanupCallMedia()
    })

    // Call ended notification
    socket.on('call:ended', (data) => {
      console.log('Call ended:', data)
      const { activeCall, incomingCall } = get()
      
      if (activeCall && activeCall.callId === data.callId) {
        set({ 
          activeCall: null,
          callStatus: 'idle'
        })
      }
      
      if (incomingCall && incomingCall.callId === data.callId) {
        set({ 
          incomingCall: null,
          callStatus: 'idle'
        })
      }
      
      // Clean up media streams
      get().cleanupCallMedia()
    })

    // WebRTC signaling
    socket.on('webrtc:signal', (data) => {
      console.log('WebRTC signal received:', data.signalType)
      const { handleWebRTCSignal } = get()
      if (handleWebRTCSignal) {
        handleWebRTCSignal(data)
      } else {
        set(state => ({ pendingWebRTCSignals: [...state.pendingWebRTCSignals, data] }))
      }
    })

    // Call errors
    socket.on('call:error', (error) => {
      console.error('Call error:', error)
      
      // Reset call state
      set({
        activeCall: null,
        incomingCall: null,
        callStatus: 'idle',
        callError: error?.error || 'Call failed'
      })
      
      get().cleanupCallMedia()
    })
  },

  // Initiate a call
  initiateCall: (conversationId, callType = 'audio') => {
    const { socket, activeConversation } = get()

    if (!socket) {
      console.error('Socket not connected')
      return false
    }

    set({ callError: null })

    if (!conversationId && !activeConversation) {
      console.error('No conversation selected')
      return false
    }

    if (activeConversation?.otherUser && String(activeConversation.otherUser.id) === String(useAuthStore.getState().user?.id)) {
      console.error('Cannot call yourself')
      return false
    }

    const targetConversationId = conversationId || activeConversation.id

    console.log(`Initiating ${callType} call for conversation:`, targetConversationId)
    
    socket.emit('call:initiate', {
      conversationId: targetConversationId,
      callType
    })

    return true
  },

  // Accept incoming call
  acceptCall: () => {
    const { socket, incomingCall } = get()
    
    if (!socket || !incomingCall) {
      console.error('No incoming call to accept')
      return false
    }

    console.log('Accepting call:', incomingCall.callId)
    
    socket.emit('call:accept', {
      callId: incomingCall.callId
    })

    return true
  },

  // Reject incoming call
  rejectCall: () => {
    const { socket, incomingCall } = get()
    
    if (!socket || !incomingCall) {
      console.error('No incoming call to reject')
      return false
    }

    console.log('Rejecting call:', incomingCall.callId)
    
    socket.emit('call:reject', {
      callId: incomingCall.callId
    })

    set({
      incomingCall: null,
      callStatus: 'idle'
    })

    return true
  },

  // End ongoing call
  endCall: () => {
    const { socket, activeCall } = get()
    
    if (!socket || !activeCall) {
      console.error('No active call to end')
      return false
    }

    console.log('Ending call:', activeCall.callId)
    
    socket.emit('call:end', {
      callId: activeCall.callId
    })

    set({
      activeCall: null,
      callStatus: 'idle'
    })

    // Clean up immediately
    get().cleanupCallMedia()

    return true
  },

  // Send WebRTC signal
  sendWebRTCSignal: (callId, signalType, signalData) => {
    const { socket } = get()
    
    if (!socket) {
      console.error('Socket not connected')
      return false
    }

    console.log(`Sending WebRTC signal: ${signalType}`)
    
    socket.emit('webrtc:signal', {
      callId,
      signalType,
      signalData
    })

    return true
  },

  // Set WebRTC signal handler
  setWebRTCSignalHandler: (handler) => {
    const pendingSignals = get().pendingWebRTCSignals
    set({ handleWebRTCSignal: handler, pendingWebRTCSignals: handler ? [] : pendingSignals })
    if (handler) {
      pendingSignals.forEach(signal => handler(signal))
    }
  },

  // Set local media stream
  setLocalStream: (stream) => {
    set({ localStream: stream })
  },

  // Set remote media stream
  setRemoteStream: (stream) => {
    set({ remoteStream: stream })
  },

  // Set peer connection
  setPeerConnection: (connection) => {
    set({ peerConnection: connection })
  },

  // Toggle mute
  toggleMute: () => {
    const { localStream, isMuted } = get()
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted
      })
      set({ isMuted: !isMuted })
    }
  },

  // Toggle video
  toggleVideo: () => {
    const { localStream } = get()
    const videoTracks = localStream?.getVideoTracks() || []
    if (!videoTracks.length) return
    const nextEnabled = !videoTracks.every(track => track.enabled)
    videoTracks.forEach(track => { track.enabled = nextEnabled })
    set({ isVideoEnabled: nextEnabled })
  },

  setVideoEnabled: (enabled) => set({ isVideoEnabled: enabled }),

  // Clean up call media
  cleanupCallMedia: () => {
    const { localStream, remoteStream, peerConnection } = get()
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
    }
    
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop())
    }
    
    if (peerConnection) {
      peerConnection.close()
    }
    
    set({
      localStream: null,
      remoteStream: null,
      peerConnection: null,
      isMuted: false,
      isVideoEnabled: false,
      handleWebRTCSignal: null,
      pendingWebRTCSignals: []
    })
  },

  // Reset call state
  resetCallState: () => {
    get().cleanupCallMedia()
    set({
      activeCall: null,
      incomingCall: null,
      callStatus: 'idle'
    })
  }
}))