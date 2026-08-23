const express = require('express');
const cors = require('cors');
const path = require('path');
const { authenticate } = require('./middleware/auth');
const upload = require('./middleware/upload');
const { uploadFile } = require('./controllers/upload');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');
const callRoutes = require('./routes/calls');
const passwordResetRoutes = require('./routes/passwordReset');

const app = express();

// Allow multiple dev origins (Vite default 5173 and legacy 3000). Can be overridden
// with `CLIENT_URLS` environment variable (comma-separated list).
const rawClientUrls = process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173,http://localhost:3000'
const allowedOrigins = rawClientUrls
  .split(',')
  .map(s => s.trim().replace(/^['"]|['"]$/g, '')) // strip surrounding quotes
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // allow non-browser tools (no origin) and allowed origins
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn('CORS: rejecting origin', origin, 'allowed:', allowedOrigins);
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(require('cookie-parser')());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/password-reset', passwordResetRoutes);
app.post('/api/upload', authenticate, upload.single('file'), uploadFile);

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// 404
app.use('*', (_req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { message: err.message }),
  });
});

module.exports = app;
