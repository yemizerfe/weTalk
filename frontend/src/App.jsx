import { useEffect } from 'react';
import axios from 'axios';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useChatStore } from './store/chatStore';
import { useSettingsStore } from './store/settingsStore';
import { initializeNotifications } from './utils/notifications';
import { subscribeToLogout } from './utils/authSync';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import Layout from './components/Layout';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  return children;
}

function App() {
  const { isAuthenticated, authChecked, setAuthChecked, logout } = useAuthStore()
  const initializeSocket = useChatStore(state => state.initializeSocket)
  const setPresence = useChatStore(state => state.setPresence)
  const disconnectSocket = useChatStore(state => state.disconnectSocket)
  const resetChatSession = useChatStore(state => state.resetChatSession)

  useEffect(() => {
    axios.get('/auth/me')
      .then(response => setAuthChecked(response.data.user))
      .catch(() => setAuthChecked(null))
  }, [setAuthChecked])

  // Log out this tab when another tab logs out (cross-tab sync)
  useEffect(() => {
    const unsubscribe = subscribeToLogout(() => {
      disconnectSocket()
      resetChatSession()
      logout()
    })
    return unsubscribe
  }, [disconnectSocket, resetChatSession, logout])

  // Apply font size to html so rem-based Tailwind classes scale
  const { fontSize } = useSettingsStore()
  useEffect(() => {
    document.documentElement.classList.remove('font-size-small', 'font-size-medium', 'font-size-large')
    document.documentElement.classList.add(`font-size-${fontSize}`)
  }, [fontSize])

  // Initialize notifications on app load
  useEffect(() => {
    if (isAuthenticated) {
      initializeNotifications();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined
    initializeSocket()
    const updatePresence = () => setPresence(document.visibilityState === 'visible')
    updatePresence()
    document.addEventListener('visibilitychange', updatePresence)
    return () => document.removeEventListener('visibilitychange', updatePresence)
  }, [isAuthenticated, initializeSocket, setPresence])

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-600">Loading...</div>
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/chat" /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/chat" /> : <Register />} />
      <Route path="/forgot-password" element={isAuthenticated ? <Navigate to="/chat" /> : <ForgotPassword />} />

      {/* Full-page profile — no sidebar */}
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

      {/* Chat with sidebar layout */}
      <Route path="/chat" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Chat />} />
      </Route>

      <Route path="/" element={<Navigate to={isAuthenticated ? '/chat' : '/login'} />} />
    </Routes>
  );
}

export default App;
