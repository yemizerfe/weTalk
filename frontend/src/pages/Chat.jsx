import { useState, useEffect, useRef } from 'react'
import { Send, Smile, SmilePlus, Paperclip, X, FileText, Pencil, Trash2, Phone, Video, Mic, Square, Play, Pause, Download, Volume2, VolumeX } from 'lucide-react'
import EmojiPicker from 'emoji-picker-react'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { useSettingsStore } from '../store/settingsStore'
import { format } from 'date-fns'
import axios from 'axios'
import CallControls from '../components/CallControls'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'

const Chat = () => {
  const {
    conversations,
    activeConversation,
    messages,
    typingUsers,
    onlineUsers,
    initializeSocket,
    setActiveConversation,
    setMessages,
    sendMessage,
    startTyping,
    stopTyping,
    markAsRead,
    editMessage,
    deleteMessage,
    reactToMessage,
    unreactToMessage,
    callError,
    clearCallError,
  } = useChatStore()

  const { user } = useAuthStore()
  const { readReceipts, enterToSend } = useSettingsStore()

  const [message, setMessage] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [voiceUploading, setVoiceUploading] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [editingMessage, setEditingMessage] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [selectedMessageId, setSelectedMessageId] = useState(null)
  const [showReactionPickerFor, setShowReactionPickerFor] = useState(null)
  const [messageToDelete, setMessageToDelete] = useState(null) // { message, mode } — mode = 'me' | 'everyone'

  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const emojiRef = useRef(null)
  const fileInputRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordingStreamRef = useRef(null)
  const recordingChunksRef = useRef([])

  const conversationMessages = activeConversation ? (messages[activeConversation.id] || []) : []
  const lastSeen = useSettingsStore.getState().lastSeen

  useEffect(() => {
    initializeSocket()
  }, [initializeSocket])

  // Load messages via REST when conversation changes
  useEffect(() => {
    if (!activeConversation) return
    axios.get(`${API_URL}/messages/conversation/${activeConversation.id}`)
      .then(res => {
        const msgs = res.data.messages || []
        setMessages(activeConversation.id, msgs)

        // mark unread messages as read if read receipts enabled
        const unread = msgs.filter(m => !m.isRead && m.senderId !== user?.id)
        if (unread.length > 0 && useSettingsStore.getState().readReceipts) {
          unread.forEach(m => markAsRead(m.id, activeConversation.id))
        }
      })
      .catch(console.error)
  }, [activeConversation?.id])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversationMessages.length])

  // Close emoji picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Detect when user selects text inside a message bubble to show edit/emoji actions
  useEffect(() => {
    const handleSelection = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        // selection cleared — keep visible until click elsewhere
        return
      }
      const range = sel.getRangeAt(0)
      const bubble = range.commonAncestorContainer?.nodeType === 3
        ? range.commonAncestorContainer.parentElement?.closest('[data-message-bubble]')
        : range.commonAncestorContainer?.closest?.('[data-message-bubble]')
      if (bubble) setSelectedMessageId(bubble.dataset.messageBubble)
    }
    const handleClick = (e) => {
      // Don't clear selection when clicking on the action bar or reaction picker
      const target = e.target
      const inActionBar = target?.closest?.('[data-message-actions]') || target?.closest?.('[data-reaction-picker]')
      if (inActionBar) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) setSelectedMessageId(null)
    }
    document.addEventListener('selectionchange', handleSelection)
    document.addEventListener('mouseup', handleSelection)
    document.addEventListener('click', handleClick)
    return () => {
      document.removeEventListener('selectionchange', handleSelection)
      document.removeEventListener('mouseup', handleSelection)
      document.removeEventListener('click', handleClick)
    }
  }, [])

  const handleTyping = (e) => {
    setMessage(e.target.value)
    if (!activeConversation) return
    if (e.target.value.trim()) {
      startTyping(activeConversation.id)
    } else {
      stopTyping(activeConversation.id)
    }
  }

  const handleEmojiClick = (emojiData) => {
    setMessage(prev => prev + emojiData.emoji)
    setShowEmoji(false)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!activeConversation) return
    if (!message.trim() && !attachment) return

    if (attachment) {
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', attachment.file)
        const res = await axios.post(`${API_URL.replace('/api', '')}/api/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        const fileUrl = res.data.url
        const msgType = attachment.type // 'image' | 'video' | 'file'
        const content = msgType === 'file'
          ? JSON.stringify({ text: message.trim(), url: fileUrl, filename: attachment.file.name })
          : message.trim() ? `${message.trim()}\n${fileUrl}` : fileUrl
        sendMessage(activeConversation.id, content, msgType)
      } catch (err) {
        console.error('Upload failed', err)
      } finally {
        setUploading(false)
        setAttachment(null)
        setMessage('')
      }
    } else {
      sendMessage(activeConversation.id, message.trim())
      setMessage('')
    }
    stopTyping(activeConversation.id)
  }

  const startEditing = (msg) => {
    setEditingMessage(msg)
    setEditingText(msg.content)
  }

  const cancelEditing = () => {
    setEditingMessage(null)
    setEditingText('')
  }

  const submitEdit = (e) => {
    e.preventDefault()
    if (!editingMessage || !editingText.trim()) return
    editMessage(activeConversation.id, editingMessage.id, editingText.trim())
    cancelEditing()
  }

  const confirmDeleteMessage = (mode) => {
    if (messageToDelete) {
      deleteMessage(activeConversation.id, messageToDelete.message.id, mode)
    }
    setMessageToDelete(null)
  }

  // ===== Emoji reactions =====
  const getReactionSummary = (msg) => {
    // msg.reactions is an array of { id, messageId, userId, emoji, createdAt }
    const reactions = msg.reactions || []
    const counts = {}
    reactions.forEach(r => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1
    })
    return Object.entries(counts).map(([emoji, count]) => ({ emoji, count }))
  }

  const toggleReaction = (msg, emoji) => {
    const hasReacted = (msg.reactions || []).some(r => r.userId === user?.id && r.emoji === emoji)
    if (hasReacted) {
      unreactToMessage(activeConversation.id, msg.id, emoji)
    } else {
      reactToMessage(activeConversation.id, msg.id, emoji)
    }
    setShowReactionPickerFor(null)
  }

  const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

  const handleAudioCall = async () => {
    if (!activeConversation) return
    if (String(activeConversation.otherUser?.id) === String(user?.id)) return
    const { initiateCall } = useChatStore.getState()
    initiateCall(activeConversation.id, 'audio')
  }

  const handleVideoCall = async () => {
    if (!activeConversation) return
    if (String(activeConversation.otherUser?.id) === String(user?.id)) return
    const { initiateCall } = useChatStore.getState()
    initiateCall(activeConversation.id, 'video')
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    setAttachment({
      file,
      previewUrl: isImage ? URL.createObjectURL(file) : isVideo ? URL.createObjectURL(file) : null,
      type: isImage ? 'image' : isVideo ? 'video' : 'file'
    })
    e.target.value = ''
  }

  const startVoiceRecording = async () => {
    if (!activeConversation || isRecording || !window.MediaRecorder) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      recordingChunksRef.current = []
      recordingStreamRef.current = stream
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = event => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        const blob = new Blob(recordingChunksRef.current, { type: mimeType })
        recordingChunksRef.current = []
        if (!blob.size) return
        setVoiceUploading(true)
        try {
          const formData = new FormData()
          formData.append('file', blob, `voice-message-${Date.now()}.webm`)
          const response = await axios.post(`${API_URL.replace('/api', '')}/api/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
          sendMessage(activeConversation.id, response.data.url, 'audio')
        } catch (error) {
          console.error('Voice message upload failed:', error)
        } finally {
          setVoiceUploading(false)
        }
      }
      recorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Voice recording permission was not granted:', error)
    }
  }

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
      setIsRecording(false)
    }
  }

  useEffect(() => () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    recordingStreamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  const getTypingUser = () => {
    if (!activeConversation) return null
    const typing = useChatStore.getState().typingUsers[activeConversation.id]
    return typing && typing.userId !== user?.id ? typing.username : null
  }

  const formatMessageTime = (date) => format(new Date(date), 'HH:mm')

  const formatDateSeparator = (date) => {
    const d = new Date(date)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return format(d, 'MMMM d, yyyy')
  }

  const shouldShowDateSeparator = (cur, prev) => {
    if (!prev) return true
    return new Date(cur.createdAt).toDateString() !== new Date(prev.createdAt).toDateString()
  }

  const getYouTubeId = (text) => {
    const match = text.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)
    return match ? match[1] : null
  }

  const VoiceMessage = ({ src, isOwn }) => {
    const audioRef = useRef(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [progress, setProgress] = useState(0)
    const [duration, setDuration] = useState(0)
    const [currentTime, setCurrentTime] = useState(0)

    useEffect(() => {
      const audio = audioRef.current
      if (!audio) return undefined
      const onLoadedMetadata = () => setDuration(audio.duration || 0)
      const onTimeUpdate = () => {
        setCurrentTime(audio.currentTime || 0)
        if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100)
      }
      const onEnded = () => {
        setIsPlaying(false)
        setProgress(0)
        setCurrentTime(0)
      }
      audio.addEventListener('loadedmetadata', onLoadedMetadata)
      audio.addEventListener('timeupdate', onTimeUpdate)
      audio.addEventListener('ended', onEnded)
      return () => {
        audio.removeEventListener('loadedmetadata', onLoadedMetadata)
        audio.removeEventListener('timeupdate', onTimeUpdate)
        audio.removeEventListener('ended', onEnded)
      }
    }, [])

    const togglePlay = () => {
      const audio = audioRef.current
      if (!audio) return
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        audio.play()
        setIsPlaying(true)
      }
    }

    const toggleMute = () => {
      const audio = audioRef.current
      if (!audio) return
      audio.muted = !audio.muted
      setIsMuted(audio.muted)
    }

    const handleDownload = async () => {
      try {
        const response = await fetch(src)
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `voice-message-${Date.now()}.webm`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch (err) {
        console.error('Download failed:', err)
      }
    }

    const formatDuration = (secs) => {
      if (!secs || isNaN(secs)) return '0:00'
      const m = Math.floor(secs / 60)
      const s = Math.floor(secs % 60)
      return `${m}:${s.toString().padStart(2, '0')}`
    }

    const handleSeek = (e) => {
      const audio = audioRef.current
      if (!audio || !audio.duration) return
      const rect = e.currentTarget.getBoundingClientRect()
      const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
      audio.currentTime = ratio * audio.duration
      setProgress(ratio * 100)
    }

    return (
      <div className={`flex items-center gap-2.5 min-w-[220px] max-w-[260px] py-1 ${isOwn ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
        <audio ref={audioRef} src={src} preload="metadata" />
        <button
          onClick={togglePlay}
          className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
            isOwn
              ? 'bg-white/20 hover:bg-white/30 text-white'
              : 'bg-primary-600 hover:bg-primary-700 text-white'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div
            className={`h-1.5 rounded-full cursor-pointer ${isOwn ? 'bg-white/25' : 'bg-gray-200 dark:bg-gray-600'}`}
            onClick={handleSeek}
          >
            <div
              className={`h-full rounded-full ${isOwn ? 'bg-white' : 'bg-primary-600'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className={`flex justify-between mt-1 text-[10px] ${isOwn ? 'text-white/80' : 'text-gray-400 dark:text-gray-500'}`}>
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            onClick={toggleMute}
            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              isOwn
                ? 'bg-white/15 hover:bg-white/30 text-white'
                : 'bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-600 dark:text-gray-300'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownload}
            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              isOwn
                ? 'bg-white/15 hover:bg-white/30 text-white'
                : 'bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-600 dark:text-gray-300'
            }`}
            title="Download voice message"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  const renderMessageContent = (msg, isOwn) => {
    if (msg.messageType === 'text') {
      const ytId = getYouTubeId(msg.content)
      if (ytId) {
        const cleanText = msg.content.replace(/https?:\/\/\S+/g, '').trim()
        return (
          <div>
            {cleanText && <p className="text-sm mb-2">{cleanText}</p>}
            <div className="rounded-lg overflow-hidden" style={{ width: '280px' }}>
              <iframe
                width="280"
                height="158"
                src={`https://www.youtube.com/embed/${ytId}`}
                title="YouTube video"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="rounded-lg"
              />
            </div>
          </div>
        )
      }
    }
  
    if (msg.messageType === 'image') {
      const parts = msg.content.split('\n')
      const imgUrl = parts[parts.length - 1]
      const text = parts.length > 1 ? parts.slice(0, -1).join('\n') : null
      return (
        <div>
          {text && <p className="text-sm mb-1">{text}</p>}
          <img src={imgUrl} alt="attachment" className="max-w-xs rounded-lg cursor-pointer" onClick={() => window.open(imgUrl, '_blank')} />
        </div>
      )
    }
    if (msg.messageType === 'video') {
      const parts = msg.content.split('\n')
      const videoUrl = parts[parts.length - 1]
      const text = parts.length > 1 ? parts.slice(0, -1).join('\n') : null
      return (
        <div>
          {text && <p className="text-sm mb-1">{text}</p>}
          <video src={videoUrl} controls className="max-w-xs rounded-lg" style={{ maxHeight: '240px' }} />
        </div>
      )
    }
    if (msg.messageType === 'audio') {
      return <VoiceMessage src={msg.content} isOwn={isOwn} />
    }
    if (msg.messageType === 'file') {
      let fileUrl
      let filename
      let text
      try {
        const fileData = JSON.parse(msg.content)
        fileUrl = fileData.url
        filename = fileData.filename
        text = fileData.text || null
      } catch {
        const parts = msg.content.split('\n')
        fileUrl = parts[parts.length - 1]
        text = parts.length > 1 ? parts.slice(0, -1).join('\n') : null
        filename = fileUrl.split('/').pop()
      }
      return (
        <div>
          {text && <p className="text-sm mb-1">{text}</p>}
          <a href={fileUrl} target="_blank" rel="noreferrer" download={filename} className="flex items-center gap-2 underline text-sm">
            <FileText className="w-4 h-4" /> {filename || 'Download file'}
          </a>
        </div>
      )
    }
    return <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
  }

  if (!activeConversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <Send className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-2">Welcome to weTalk</h3>
          <p className="text-gray-500 dark:text-gray-400">Select a conversation to start messaging</p>
        </div>
      </div>
    )
  }

  const typingUser = getTypingUser()
  const livePresence = activeConversation
    ? onlineUsers.find(u => String(u.id) === String(activeConversation.otherUser.id))
    : null
  const otherIsOnline = livePresence ? !!livePresence.isOnline : !!activeConversation?.otherUser?.isOnline

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gray-400 rounded-full overflow-hidden flex items-center justify-center text-white font-semibold">
                {activeConversation.otherUser.avatar
                    ? <img src={activeConversation.otherUser.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                    : activeConversation.otherUser.username[0].toUpperCase()
                  }
                </div>
                {otherIsOnline && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full" />
                )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{activeConversation.otherUser.username}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 status-text">
                {otherIsOnline
                    ? 'Online'
                    : lastSeen && activeConversation.otherUser.lastSeen
                      ? `Last seen ${format(new Date(activeConversation.otherUser.lastSeen), 'MMM d, HH:mm')}`
                      : 'Offline'
                  }
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleAudioCall}
              className="p-2.5 bg-green-600 hover:bg-green-700 text-white rounded-full transition-colors"
              title="Voice call"
            >
              <Phone className="w-5 h-5" />
            </button>
            <button
              onClick={handleVideoCall}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors"
              title="Video call"
            >
              <Video className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {callError && (
        <button
          type="button"
          onClick={clearCallError}
          className="mx-4 mt-2 rounded-lg bg-red-50 px-3 py-2 text-left text-sm text-red-700"
        >
          {callError}
        </button>
      )}

      {/* Messages — flex-1 + min-h-0 makes this scrollable */}
      <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1 bg-gray-50 dark:bg-gray-900">
        {conversationMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400 dark:text-gray-500">No messages yet. Say hello! 👋</p>
          </div>
        ) : (
          conversationMessages.map((msg, index) => {
            const isOwn = String(msg.senderId) === String(user?.id)
            const showSep = shouldShowDateSeparator(msg, conversationMessages[index - 1])
            return (
              <div key={msg.id}>
                {showSep && (
                  <div className="flex items-center justify-center my-4">
                    <div className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-3 py-1 rounded-full">
                      {formatDateSeparator(msg.createdAt)}
                    </div>
                  </div>
                )}
                <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 items-start gap-1.5 relative`}>
                  {/* Always-visible action buttons — left of sender's bubble, right of receiver's bubble */}
                  {isOwn && (
                    <div data-message-actions className="flex items-center gap-1 z-30 mt-1 order-first">
                      <button
                        onClick={() => startEditing(msg)}
                        className="p-1.5 bg-white dark:bg-gray-700 rounded-full shadow hover:scale-110 transition-transform"
                        title="Edit message"
                      >
                        <Pencil className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                      </button>
                      <button
                        onClick={() => setMessageToDelete({ message: msg })}
                        className="p-1.5 bg-white dark:bg-gray-700 rounded-full shadow hover:scale-110 transition-transform"
                        title="Delete message"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                      <button
                        onClick={() => setShowReactionPickerFor(showReactionPickerFor === msg.id ? null : msg.id)}
                        className="p-1.5 bg-white dark:bg-gray-700 rounded-full shadow hover:scale-110 transition-transform"
                        title="React"
                      >
                        <SmilePlus className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                      </button>
                    </div>
                  )}
                  {!isOwn && (
                    <div data-message-actions className="flex items-center gap-1 z-30 mt-1 order-last">
                      <button
                        onClick={() => setMessageToDelete({ message: msg })}
                        className="p-1.5 bg-white dark:bg-gray-700 rounded-full shadow hover:scale-110 transition-transform"
                        title="Delete message"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                      <button
                        onClick={() => setShowReactionPickerFor(showReactionPickerFor === msg.id ? null : msg.id)}
                        className="p-1.5 bg-white dark:bg-gray-700 rounded-full shadow hover:scale-110 transition-transform"
                        title="React"
                      >
                        <SmilePlus className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                      </button>
                    </div>
                  )}

                  {/* Reaction picker popover — shown below the action bar, aligned to the message */}
                  {showReactionPickerFor === msg.id && (
                    <div
                      data-reaction-picker
                      className={`absolute ${
                        isOwn ? 'right-0' : 'left-0'
                      } top-full mt-10 z-40 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 px-2 py-1.5 flex items-center gap-1`}
                    >
                      {QUICK_REACTIONS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(msg, emoji)}
                          className={`text-xl hover:scale-125 transition-transform ${(msg.reactions || []).some(r => r.userId === user?.id && r.emoji === emoji) ? 'opacity-100' : 'opacity-70'}`}
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <div
                    data-message-bubble={msg.id}
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                    isOwn
                      ? 'bg-primary-600 text-white rounded-br-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm rounded-bl-sm'
                  }`}>
                    {renderMessageContent(msg, isOwn)}
                    <div className={`flex items-center justify-end space-x-1 mt-1 ${isOwn ? 'text-primary-100' : 'text-gray-400 dark:text-gray-500'}`}>
                      <span className="text-xs">{formatMessageTime(msg.createdAt)}</span>
                      {msg.isEdited && (
                        <span className="text-xs italic">edited</span>
                      )}
                      {isOwn && readReceipts && (
                        <span className="text-xs">{msg.isRead ? '✓✓' : '✓'}</span>
                      )}
                    </div>
                    {/* Reactions display */}
                    {getReactionSummary(msg).length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        {getReactionSummary(msg).map(({ emoji, count }) => {
                          const hasReacted = (msg.reactions || []).some(r => r.userId === user?.id && r.emoji === emoji)
                          return (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(msg, emoji)}
                              className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${
                                hasReacted
                                  ? isOwn
                                    ? 'bg-white/25 text-white'
                                    : 'bg-primary-100 dark:bg-primary-900/40 text-gray-900 dark:text-white'
                                  : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'
                              }`}
                              title={hasReacted ? 'Remove reaction' : 'Add reaction'}
                            >
                              <span>{emoji}</span>
                              <span>{count}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}

        {typingUser && (
          <div className="flex justify-start mb-1">
            <div className="bg-white dark:bg-gray-700 shadow-sm px-4 py-2 rounded-2xl rounded-bl-sm">
              <div className="flex items-center space-x-1">
                <div className="typing-dot w-2 h-2 bg-gray-400 rounded-full" />
                <div className="typing-dot w-2 h-2 bg-gray-400 rounded-full" />
                <div className="typing-dot w-2 h-2 bg-gray-400 rounded-full" />
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{typingUser} is typing...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Attachment preview */}
      {attachment && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center gap-3">
          {attachment.type === 'image'
            ? <img src={attachment.previewUrl} alt="preview" className="w-16 h-16 object-cover rounded-lg" />
            : attachment.type === 'video'
              ? <video src={attachment.previewUrl} className="w-16 h-16 object-cover rounded-lg" />
              : <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><FileText className="w-5 h-5" />{attachment.file.name}</div>
          }
          <button onClick={() => setAttachment(null)} className="ml-auto text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 relative">
        {showEmoji && (
          <div ref={emojiRef} className="absolute bottom-20 left-4 z-50">
            <EmojiPicker
              onEmojiClick={handleEmojiClick}
              height={380}
              width={320}
              theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
            />
          </div>
        )}
        {/* Editing banner */}
        {editingMessage && (
          <div className="flex items-center justify-between mb-2 px-3 py-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-primary-700 dark:text-primary-300">
              <Pencil className="w-4 h-4" />
              <span>Editing message</span>
            </div>
            <button onClick={cancelEditing} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <form onSubmit={editingMessage ? submitEdit : handleSend} className="flex items-center space-x-2">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar" className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <Paperclip className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>

          {editingMessage ? (
            <>
              <input
                type="text"
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) submitEdit(e)
                  if (e.key === 'Escape') cancelEditing()
                }}
                autoFocus
                placeholder="Edit message…"
                className="flex-1 px-4 py-2 border border-primary-400 dark:border-primary-600 rounded-full focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 text-sm"
              />
              <button
                type="submit"
                disabled={!editingText.trim()}
                className="px-3 py-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                value={message}
                onChange={handleTyping}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && enterToSend) handleSend(e)
                  if (e.key === 'Enter' && e.shiftKey && !enterToSend) handleSend(e)
                }}
                placeholder={enterToSend ? 'Type a message… (Enter to send)' : 'Type a message… (Shift+Enter to send)'}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 text-sm"
              />

              <button type="button" onClick={() => setShowEmoji(v => !v)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <Smile className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>

              <button
                type="button"
                onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                disabled={voiceUploading}
                className={`p-2 rounded-lg transition-colors ${isRecording ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'} disabled:opacity-50`}
                title={isRecording ? 'Stop recording' : 'Record voice message'}
              >
                {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                type="submit"
                disabled={(!message.trim() && !attachment) || uploading}
                className="p-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </>
          )}
        </form>
      </div>

      <CallControls />

      {/* Delete message modal — choose who the message is deleted for */}
      {messageToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMessageToDelete(null)}
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[90%] max-w-sm p-6 animate-modal-in">
            <button
              onClick={() => setMessageToDelete(null)}
              className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Delete message?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Choose who should no longer see this message.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <button
                onClick={() => confirmDeleteMessage('me')}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Delete for me</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Only you won't see this message anymore</p>
                </div>
                <Trash2 className="w-4 h-4 text-gray-500 dark:text-gray-300 flex-shrink-0" />
              </button>

              <button
                onClick={() => confirmDeleteMessage('everyone')}
                className="w-full flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">Delete for everyone</p>
                  <p className="text-xs text-red-500 dark:text-red-400">Remove this message for all users</p>
                </div>
                <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              </button>
            </div>

            <div className="mt-4">
              <button
                onClick={() => setMessageToDelete(null)}
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Chat