import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Eye, EyeOff } from 'lucide-react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'

function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: '' }
  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 10) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500' }
  if (score <= 3) return { score, label: 'Fair', color: 'bg-yellow-400' }
  if (score === 4) return { score, label: 'Good', color: 'bg-blue-500' }
  return { score, label: 'Strong', color: 'bg-green-500' }
}

export default function Register() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [usernameAvailability, setUsernameAvailability] = useState('idle')

  const { login } = useAuthStore()
  const navigate = useNavigate()

  const strength = getPasswordStrength(password)

  useEffect(() => {
    const value = username.trim()
    if (value.length < 3 || !/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameAvailability('idle')
      return undefined
    }
    setUsernameAvailability('checking')
    let cancelled = false
    const timer = setTimeout(() => {
      axios.get(`${API_URL}/auth/username-availability`, { params: { username: value } })
        .then(response => {
          if (!cancelled) setUsernameAvailability(response.data.available ? 'available' : 'taken')
        })
        .catch(() => { if (!cancelled) setUsernameAvailability('idle') })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [username])

  const validateField = (name, value) => {
    let msg = ''
    if (name === 'email') {
      if (!value) msg = 'Email is required'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) msg = 'Enter a valid email address'
    }
    if (name === 'username') {
      if (!value) msg = 'Username is required'
      else if (value.length < 3) msg = 'Username must be at least 3 characters'
      else if (value.length > 30) msg = 'Username must be under 30 characters'
      else if (!/^[a-zA-Z0-9_]+$/.test(value)) msg = 'Only letters, numbers and underscores allowed'
    }
    if (name === 'password') {
      if (!value) msg = 'Password is required'
      else if (value.length < 6) msg = 'Password must be at least 6 characters'
    }
    if (name === 'confirmPassword') {
      if (!value) msg = 'Please confirm your password'
      else if (value !== password) msg = 'Passwords do not match'
    }
    setFieldErrors(prev => ({ ...prev, [name]: msg }))
    return msg
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const errors = {
      email: validateField('email', email),
      username: validateField('username', username),
      password: validateField('password', password),
      confirmPassword: validateField('confirmPassword', confirmPassword),
    }
    if (usernameAvailability !== 'available') {
      setError(usernameAvailability === 'taken' ? 'Username is already taken' : 'Please wait for username availability check')
      return
    }
    if (Object.values(errors).some(Boolean)) return
    setLoading(true)
    try {
      const response = await axios.post(`${API_URL}/auth/register`, { email, username, password })
      const { user } = response.data
      login(user)
      navigate('/chat')
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = (field) =>
    `w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-gray-900 placeholder-gray-400 bg-white ${
      fieldErrors[field] ? 'border-red-400 bg-red-50' : 'border-gray-300'
    }`

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700">
      <div className="max-w-md w-full mx-4">
        <div className="auth-card bg-white rounded-lg shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-black">Create Account</h1>
            <p className="text-gray-600 mt-2">Get started with weTalk</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); validateField('email', e.target.value) }}
                onBlur={(e) => validateField('email', e.target.value)}
                className={inputClass('email')}
                placeholder="you@example.com"
              />
              {fieldErrors.email && <p className="text-red-500 text-xs mt-1">{fieldErrors.email}</p>}
            </div>

            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); validateField('username', e.target.value) }}
                onBlur={(e) => validateField('username', e.target.value)}
                className={inputClass('username')}
                placeholder="johndoe"
              />
              {fieldErrors.username
                ? <p className="text-red-500 text-xs mt-1">{fieldErrors.username}</p>
                : usernameAvailability === 'checking'
                  ? <p className="text-gray-400 text-xs mt-1">Checking username...</p>
                  : usernameAvailability === 'taken'
                    ? <p className="text-red-500 text-xs mt-1">Username is already taken</p>
                    : usernameAvailability === 'available'
                      ? <p className="text-green-600 text-xs mt-1">Username is available</p>
                      : <p className="text-gray-400 text-xs mt-1">3–30 characters, letters, numbers and underscores only</p>
              }
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); validateField('password', e.target.value) }}
                  onBlur={(e) => validateField('password', e.target.value)}
                  className={`${inputClass('password')} pr-10`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && <p className="text-red-500 text-xs mt-1">{fieldErrors.password}</p>}

              {/* Strength meter */}
              {password && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= strength.score ? strength.color : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs font-medium ${
                    strength.label === 'Weak' ? 'text-red-500' :
                    strength.label === 'Fair' ? 'text-yellow-500' :
                    strength.label === 'Good' ? 'text-blue-500' : 'text-green-500'
                  }`}>
                    {strength.label} password
                  </p>
                  <ul className="space-y-0.5">
                    {[
                      { met: password.length >= 8, text: 'At least 8 characters' },
                      { met: /[A-Z]/.test(password), text: '1 uppercase letter' },
                      { met: /[0-9]/.test(password), text: '1 number' },
                    ].map(({ met, text }) => (
                      <li key={text} className={`text-xs flex items-center gap-1 ${
                        met ? 'text-green-600' : 'text-gray-400'
                      }`}>
                        <span>{met ? '✓' : '○'}</span> {text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); validateField('confirmPassword', e.target.value) }}
                  onBlur={(e) => validateField('confirmPassword', e.target.value)}
                  className={`${inputClass('confirmPassword')} pr-10`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="text-red-500 text-xs mt-1">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}