import { useState, useEffect, useRef } from 'react'
import { MessageSquare, Search, LogOut, User, Settings, X, Bell, Moon, Sun, Shield, Volume2, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { useSettingsStore } from '../store/settingsStore'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { formatDistanceToNow } from 'date-fns'
import { broadcastLogout } from '../utils/authSync'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'

function SettingsModal({ onClose, onLogout }) {
  const settings = useSettingsStore()
  const navigate = useNavigate()

  const Toggle = ({ value, onChange }) => (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )

  const sections = [
    {
      title: 'Notifications',
      items: [
        { icon: <Bell className="w-4 h-4" />, label: 'Push notifications', value: settings.notifications, onChange: settings.setNotifications },
        { icon: <Volume2 className="w-4 h-4" />, label: 'Message sounds', value: settings.sounds, onChange: settings.setSounds },
        { icon: <Bell className="w-4 h-4" />, label: 'Message preview', value: settings.messagePreview, onChange: settings.setMessagePreview },
      ]
    },
    {
      title: 'Appearance',
      items: [
        { icon: settings.darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />, label: 'Dark mode', value: settings.darkMode, onChange: settings.setDarkMode },
      ]
    },
    {
      title: 'Chat',
      items: [
        { icon: <ChevronRight className="w-4 h-4" />, label: 'Enter key to send', value: settings.enterToSend, onChange: settings.setEnterToSend },
      ]
    },
    {
      title: 'Privacy',
      items: [
        { icon: <Shield className="w-4 h-4" />, label: 'Read receipts', value: settings.readReceipts, onChange: settings.setReadReceipts },
        { icon: <Shield className="w-4 h-4" />, label: 'Show last seen', value: settings.lastSeen, onChange: settings.setLastSeen },
      ]
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-80 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {sections.map(section => (
            <div key={section.title}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{section.title}</p>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-600">
                {section.items.map(item => (
                  <div key={item.label} className="flex items-center justify-between px-3 py-3">
                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                      {item.icon}
                      <span className="text-sm">{item.label}</span>
                    </div>
                    <Toggle value={item.value} onChange={item.onChange} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Account</p>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-600">
              <button
                onClick={() => { navigate('/profile'); onClose() }}
                className="w-full flex items-center justify-between px-3 py-3 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                  <User className="w-4 h-4" />
                  <span className="text-sm">Edit Profile</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">Log out</span>
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-gray-300 dark:text-gray-600">weTalk v1.0.0</p>
        </div>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [recentUsers, setRecentUsers] = useState([])
  const searchRef = useRef(null)

  const { user, logout } = useAuthStore()
  const { conversations, setConversations, setActiveConversation, activeConversation, onlineUsers, unreadCounts, disconnectSocket, resetChatSession } = useChatStore()
  const navigate = useNavigate()

  useEffect(() => { fetchConversations() }, [])

  useEffect(() => {
    const query = searchQuery.trim()
    if (query.length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return undefined
    }

    let cancelled = false
    setIsSearching(true)
    axios.get(`${API_URL}/users/search`, { params: { q: query } })
      .then(res => {
        if (!cancelled) {
          setSearchResults(res.data.users || [])
          setIsSearching(false)
        }
      })
      .catch(e => {
        if (!cancelled) {
          console.error(e)
          setSearchResults([])
          setIsSearching(false)
        }
      })

    return () => { cancelled = true }
  }, [searchQuery])

  useEffect(() => {
    setRecentUsers(conversations.filter(c => c.lastMessage).slice(0, 8).map(c => c.otherUser))
  }, [conversations])

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/conversations`)
      setConversations(res.data.conversations)
    } catch (e) { console.error(e) }
  }

  const startConversation = async (userId) => {
    try {
      const res = await axios.post(`${API_URL}/conversations`, { userId })
      const incoming = res.data
      // Preserve existing lastMessage if the server returned none (shouldn't happen now, but safe)
      const existing = conversations.find(c => c.id === incoming.id)
      const conv = { ...existing, ...incoming, lastMessage: incoming.lastMessage ?? existing?.lastMessage ?? null }
      setConversations([conv, ...conversations.filter(c => c.id !== conv.id)])
      setActiveConversation(conv)
      setShowSearch(false); setSearchQuery(''); setSearchResults([])
    } catch (e) { console.error(e) }
  }

  const handleLogout = async () => {
    try {
      await axios.post(`${API_URL}/auth/logout`)
    } catch (e) { console.error(e) } finally {
      disconnectSocket()
      resetChatSession()
      broadcastLogout()
      logout()
      navigate('/login', { replace: true })
    }
  }

  const isOnline = (userId) => {
    const livePresence = onlineUsers.find(u => String(u.id) === String(userId))
    if (livePresence) return !!livePresence.isOnline
    return conversations.some(c => String(c.otherUser?.id) === String(userId) && !!c.otherUser?.isOnline)
  }
  const onlineConvs = conversations.filter(c => isOnline(c.otherUser.id))
  const offlineConvs = conversations.filter(c => !isOnline(c.otherUser.id))

  const ConversationItem = ({ conversation }) => (
    <div
      onClick={() => setActiveConversation(conversation)}
      className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer border-b border-gray-100 dark:border-gray-700 transition-colors ${activeConversation?.id === conversation.id ? 'bg-primary-50 dark:bg-gray-700 border-l-2 border-l-primary-500' : ''}`}
    >
      <div className="flex items-center space-x-3">
        <div className="relative flex-shrink-0">
          <div className="w-11 h-11 bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden flex items-center justify-center font-semibold">
            {conversation.otherUser.avatar
              ? <img src={conversation.otherUser.avatar} alt="" className="w-full h-full object-cover" />
              : <span className="text-gray-600 dark:text-gray-300">{conversation.otherUser.username[0].toUpperCase()}</span>
            }
          </div>
          <div className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white dark:border-gray-800 rounded-full ${isOnline(conversation.otherUser.id) ? 'bg-green-500' : 'bg-gray-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{conversation.otherUser.username}</p>
            {conversation.lastMessage && (
              <span className="text-xs text-gray-400 flex-shrink-0 ml-1">
                {formatDistanceToNow(new Date(conversation.lastMessage.createdAt), { addSuffix: false })}
              </span>
            )}
            {unreadCounts[conversation.id] > 0 && (
              <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-xs font-bold text-white">
                {unreadCounts[conversation.id] > 99 ? '99+' : unreadCounts[conversation.id]}
              </span>
            )}
          </div>
          {conversation.lastMessage ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {conversation.lastMessage.senderId === user.id ? 'You: ' : ''}
              {conversation.lastMessage.messageType === 'audio'
                ? '🎤 Voice message'
                : conversation.lastMessage.messageType === 'image'
                  ? '📷 Photo'
                  : conversation.lastMessage.messageType === 'video'
                    ? '🎥 Video'
                    : conversation.lastMessage.messageType === 'file'
                      ? '📎 File'
                      : conversation.lastMessage.content}
            </p>
          ) : (
            <p className="text-xs text-gray-400 italic">No messages yet</p>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onLogout={handleLogout} />}

      <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">weTalk</h1>
            </div>
            <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <Settings className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Search */}
          <div className="relative" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowSearch(true)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]) }} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}
            {showSearch && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-10 max-h-56 overflow-y-auto">
                {searchResults.map((u) => (
                  <div key={u.id} onClick={() => startConversation(u.id)} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center space-x-3">
                    <div className="relative">
                      <div className="w-9 h-9 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden flex items-center justify-center">
                        {u.avatar
                          ? <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                          : <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{u.username[0].toUpperCase()}</span>
                        }
                      </div>
                      <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-white dark:border-gray-800 rounded-full ${isOnline(u.id) ? 'bg-green-500' : 'bg-gray-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.username}</p>
                      <p className="text-xs text-gray-400">{isOnline(u.id) ? 'Online' : 'Offline'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showSearch && searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-500 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                No users found
              </div>
            )}
          </div>
        </div>

        {/* Recent Users Strip */}
        {recentUsers.length > 0 && !searchQuery && (
          <div className="px-4 pt-3 pb-2 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent</p>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
              {recentUsers.map(u => (
                <button key={u.id} onClick={() => startConversation(u.id)} className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden flex items-center justify-center">
                      {u.avatar
                        ? <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                        : <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">{u.username[0].toUpperCase()}</span>
                      }
                    </div>
                    <div className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white dark:border-gray-800 rounded-full ${isOnline(u.id) ? 'bg-green-500' : 'bg-gray-400'}`} />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate w-12 text-center">{u.username}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Search for users to start chatting</p>
            </div>
          ) : (
            <>
              {onlineConvs.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50">
                    <span className="text-xs font-semibold text-green-600 uppercase tracking-wider">● Online — {onlineConvs.length}</span>
                  </div>
                  {onlineConvs.map(c => <ConversationItem key={c.id} conversation={c} />)}
                </>
              )}
              {offlineConvs.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">● Offline — {offlineConvs.length}</span>
                  </div>
                  {offlineConvs.map(c => <ConversationItem key={c.id} conversation={c} />)}
                </>
              )}
            </>
          )}
        </div>

        {/* Current User */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center space-x-3">
            <button onClick={() => navigate('/profile')} className="relative flex-shrink-0 group" title="Edit profile">
              <div className="w-10 h-10 bg-primary-600 rounded-full overflow-hidden flex items-center justify-center text-white font-semibold">
                {user?.avatar
                  ? <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                  : <span>{user?.username?.[0]?.toUpperCase()}</span>
                }
              </div>
              <div className="absolute inset-0 bg-black/30 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.username}</p>
              <p className="text-xs text-green-500">Online</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
