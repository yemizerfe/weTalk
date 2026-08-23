import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera, ArrowLeft, Check, Eye, EyeOff, User, Lock, Bell,
  Moon, Sun, Shield, Volume2, MessageSquare, Smartphone, Trash2, LogOut, ChevronRight
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { useSettingsStore } from '../store/settingsStore'
import { broadcastLogout } from '../utils/authSync'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'

const TABS = [
  { id: 'profile',       label: 'Profile',       icon: User },
  { id: 'security',      label: 'Security',       icon: Lock },
  { id: 'notifications', label: 'Notifications',  icon: Bell },
  { id: 'appearance',    label: 'Appearance',     icon: Sun },
  { id: 'privacy',       label: 'Privacy',        icon: Shield },
  { id: 'chat',          label: 'Chat',           icon: MessageSquare },
]

function Toggle({ value, onChange, label }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`toggle-track relative w-11 h-6 rounded-full ${value ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span className={`toggle-thumb absolute top-1 w-4 h-4 bg-white rounded-full shadow ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm px-4">{children}</div>
    </div>
  )
}

function Msg({ msg }) {
  if (!msg) return null
  return (
    <div className={`text-sm px-3 py-2 rounded-lg ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
      {msg.text}
    </div>
  )
}

// ── Tab panels ────────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, updateUser } = useAuthStore()
  const updateUserInConversations = useChatStore(state => state.updateUserInConversations)
  const [username, setUsername] = useState(user?.username || '')
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [usernameError, setUsernameError] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null)

  const validate = (v) => {
    if (!v) return 'Username is required'
    if (v.length < 3) return 'At least 3 characters'
    if (v.length > 30) return 'Max 30 characters'
    if (!/^[a-zA-Z0-9_]+$/.test(v)) return 'Letters, numbers and underscores only'
    return ''
  }

  const handleAvatarChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setMsg({ type: 'error', text: 'Only image files allowed' }); return }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    const err = validate(username)
    if (err) { setUsernameError(err); return }
    setLoading(true); setMsg(null)
    try {
      let avatarUrl = user?.avatar
      if (avatarFile) {
        const fd = new FormData()
        fd.append('file', avatarFile)
        const up = await axios.post(`${API_URL.replace('/api', '')}/api/upload`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        avatarUrl = up.data.url
      }
      const profileData = { avatar: avatarUrl }
      if (username.trim() !== user?.username) profileData.username = username.trim()
      const res = await axios.put(`${API_URL}/users/me`, profileData)
      updateUser(res.data.user)
      updateUserInConversations(res.data.user)
      setAvatarFile(null)
      setMsg({ type: 'success', text: 'Profile updated!' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update profile' })
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Avatar */}
      <div className="flex flex-col items-center gap-3 py-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
        <div className="relative">
          <div className="w-28 h-28 rounded-full bg-primary-600 overflow-hidden flex items-center justify-center text-white text-4xl font-bold">
            {avatarPreview
              ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
              : user?.username?.[0]?.toUpperCase()
            }
          </div>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="absolute bottom-1 right-1 w-8 h-8 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center text-white shadow-md transition-colors">
            <Camera className="w-4 h-4" />
          </button>
          <input type="file" ref={fileRef} accept="image/*" onChange={handleAvatarChange} className="hidden" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-900 dark:text-white">{user?.username}</p>
          <p className="text-sm text-gray-400">{user?.email}</p>
        </div>
      </div>

      <Section title="Account Info">
        <div className="py-3 border-b border-gray-100 dark:border-gray-700">
          <label className="block text-xs text-gray-400 mb-1">Email</label>
          <input value={user?.email || ''} disabled
            className="w-full text-sm text-gray-500 dark:text-gray-400 bg-transparent outline-none cursor-not-allowed" />
        </div>
        <div className="py-3">
          <label className="block text-xs text-gray-400 mb-1">Username</label>
          <input
            value={username}
            onChange={(e) => { setUsername(e.target.value); setUsernameError(validate(e.target.value)) }}
            className="w-full text-sm text-gray-900 dark:text-white bg-transparent outline-none border-b border-transparent focus:border-primary-500 transition-colors"
          />
          {usernameError && <p className="text-red-500 text-xs mt-1">{usernameError}</p>}
        </div>
      </Section>

      <Msg msg={msg} />

      <button type="submit" disabled={loading}
        className="w-full bg-primary-600 text-white py-2.5 rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 font-medium">
        {loading ? 'Saving...' : <><Check className="w-4 h-4" /> Save Changes</>}
      </button>
    </form>
  )
}

function SecurityTab() {
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const { logout } = useAuthStore()
  const disconnectSocket = useChatStore(state => state.disconnectSocket)
  const resetChatSession = useChatStore(state => state.resetChatSession)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault(); setMsg(null)
    if (!current) { setMsg({ type: 'error', text: 'Current password is required' }); return }
    if (newPw.length < 6) { setMsg({ type: 'error', text: 'New password must be at least 6 characters' }); return }
    if (newPw !== confirm) { setMsg({ type: 'error', text: 'Passwords do not match' }); return }
    setLoading(true)
    try {
      await axios.put(`${API_URL}/users/me/password`, { currentPassword: current, newPassword: newPw })
      setCurrent(''); setNewPw(''); setConfirm('')
      setMsg({ type: 'success', text: 'Password changed successfully!' })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to change password' })
    } finally { setLoading(false) }
  }

  const handleDeleteAccount = async () => {
    if (!deletePassword) return
    setDeleting(true)
    try {
      await axios.delete(`${API_URL}/users/me`, { data: { password: deletePassword } })
      disconnectSocket()
      broadcastLogout()
      logout()
      navigate('/login', { replace: true })
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to delete account' })
    } finally { setDeleting(false) }
  }

  const PwField = ({ label, value, set, show, toggle }) => (
    <div className="py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="flex items-center">
        <input type={show ? 'text' : 'password'} value={value} onChange={e => set(e.target.value)} placeholder="••••••••"
          className="flex-1 text-sm text-gray-900 dark:text-white bg-transparent outline-none border-b border-transparent focus:border-primary-500 transition-colors" />
        <button type="button" onClick={toggle} className="text-gray-400 hover:text-gray-600 ml-2" tabIndex={-1}>
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Section title="Change Password">
        <PwField label="Current Password" value={current} set={setCurrent} show={showCurrent} toggle={() => setShowCurrent(v => !v)} />
        <PwField label="New Password" value={newPw} set={setNewPw} show={showNew} toggle={() => setShowNew(v => !v)} />
        <PwField label="Confirm New Password" value={confirm} set={setConfirm} show={showNew} toggle={() => setShowNew(v => !v)} />
      </Section>
      <Msg msg={msg} />
      <button type="submit" disabled={loading}
        className="w-full bg-gray-900 text-white py-2.5 rounded-xl hover:bg-black disabled:opacity-50 transition-colors font-medium">
        {loading ? 'Updating...' : 'Update Password'}
      </button>

      <Section title="Delete Account">
        <p className="py-3 text-sm text-gray-500 dark:text-gray-400">
          Permanently delete your profile, messages, conversations, and account data.
        </p>
        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          disabled={deleting}
          className="w-full flex items-center justify-center gap-2 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors font-medium"
        >
          <Trash2 className="w-4 h-4" />
          Delete Account
        </button>
      </Section>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-2xl">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 id="delete-account-title" className="text-lg font-bold text-gray-900 dark:text-white">Delete your account?</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-300">This permanently removes your profile, messages, and conversations. This action cannot be undone.</p>
              </div>
            </div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Confirm with your current password
              <input
                autoFocus
                type="password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                placeholder="Current password"
                className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
              />
            </label>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => { setShowDeleteModal(false); setDeletePassword('') }} className="flex-1 rounded-lg bg-gray-100 dark:bg-gray-700 px-4 py-2.5 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600">Cancel</button>
              <button type="button" onClick={handleDeleteAccount} disabled={!deletePassword || deleting} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">{deleting ? 'Deleting...' : 'Yes, delete account'}</button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}

function NotificationsTab() {
  const s = useSettingsStore()
  return (
    <div className="space-y-6">
      <Section title="Messages">
        <Toggle label="Push notifications" value={s.notifications} onChange={s.setNotifications} />
        <Toggle label="Message sounds" value={s.sounds} onChange={s.setSounds} />
        <Toggle label="Show message preview" value={s.messagePreview} onChange={s.setMessagePreview} />
      </Section>
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
        Notification settings are saved locally and apply to this device only.
      </div>
    </div>
  )
}

function AppearanceTab() {
  const s = useSettingsStore()
  return (
    <div className="space-y-6">
      <Section title="Theme">
        <div className="py-4 flex gap-3">
          {[
            { label: 'Light', icon: <Sun className="w-5 h-5" />, value: false },
            { label: 'Dark', icon: <Moon className="w-5 h-5" />, value: true },
          ].map(opt => (
            <button key={opt.label} type="button" onClick={() => s.setDarkMode(opt.value)}
              className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-colors ${s.darkMode === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}>
              {opt.icon}
              <span className="text-sm font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Font Size">
        <div className="py-4 flex gap-2">
          {['small', 'medium', 'large'].map(size => (
            <button key={size} type="button" onClick={() => s.setFontSize(size)}
              className={`flex-1 py-2 rounded-lg border-2 text-sm capitalize transition-colors ${s.fontSize === size ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300'}`}>
              {size}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}

function PrivacyTab() {
  const s = useSettingsStore()
  return (
    <div className="space-y-6">
      <Section title="Visibility">
        <Toggle label="Show read receipts (✓✓)" value={s.readReceipts} onChange={s.setReadReceipts} />
        <Toggle label="Show last seen" value={s.lastSeen} onChange={s.setLastSeen} />
      </Section>
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800 rounded-xl p-4 text-sm text-yellow-700 dark:text-yellow-300">
        Turning off read receipts means you also won't see others' read receipts.
      </div>
    </div>
  )
}

function ChatTab() {
  const s = useSettingsStore()
  return (
    <div className="space-y-6">
      <Section title="Messaging">
        <Toggle label="Press Enter to send" value={s.enterToSend} onChange={s.setEnterToSend} />
        <Toggle label="Message sounds" value={s.sounds} onChange={s.setSounds} />
      </Section>
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-sm text-gray-500 dark:text-gray-400">
        When "Enter to send" is off, use Shift+Enter to send and Enter for new line.
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Profile() {
  const [activeTab, setActiveTab] = useState('profile')
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const disconnectSocket = useChatStore(state => state.disconnectSocket)
  const resetChatSession = useChatStore(state => state.resetChatSession)
  const initializeSocket = useChatStore(state => state.initializeSocket)

  useEffect(() => {
    initializeSocket()
  }, [initializeSocket])

  const handleLogout = async () => {
    try {
      await axios.post(`${API_URL}/auth/logout`)
    } catch (_) {}
    disconnectSocket()
    resetChatSession()
    broadcastLogout()
    logout()
    navigate('/login', { replace: true })
  }

  const panels = {
    profile: <ProfileTab />,
    security: <SecurityTab />,
    notifications: <NotificationsTab />,
    appearance: <AppearanceTab />,
    privacy: <PrivacyTab />,
    chat: <ChatTab />,
  }

  return (
    <div className="h-screen w-screen flex bg-gray-100 dark:bg-gray-900 overflow-hidden">
      {/* Left sidebar nav */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors text-sm mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to chat
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Settings</h1>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === id ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-700">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-gray-900">
        <div className="max-w-xl mx-auto p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            {TABS.find(t => t.id === activeTab)?.label}
          </h2>
          {panels[activeTab]}
        </div>
      </div>
    </div>
  )
}
