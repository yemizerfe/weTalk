# weTalk - Chat Application

A full-featured real-time chat application built with React, Socket.IO, PostgreSQL, Prisma, and Redis.

## Features

- **Real-time Messaging**: Instant message delivery using Socket.IO
- **User Authentication**: Secure JWT-based authentication
- **Online Status**: Real-time user presence indicators
- **Typing Indicators**: See when others are typing
- **Read Receipts**: Message read status (✓/✓✓)
- **Conversation Management**: Create and manage conversations
- **User Search**: Search for users to start new conversations
- **Redis Caching**: Fast data retrieval and session management
- **Responsive Design**: Modern UI with Tailwind CSS

## Tech Stack

### Backend
- **Node.js** with Express
- **Socket.IO** for real-time communication
- **Prisma** as ORM
- **PostgreSQL** for database
- **Redis** for caching and session management
- **JWT** for authentication
- **bcrypt** for password hashing

### Frontend
- **React 18** with Vite
- **React Router** for navigation
- **Socket.IO Client** for real-time features
- **Zustand** for state management
- **Axios** for API calls
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **date-fns** for date formatting

## Prerequisites

Before running this application, make sure you have the following installed:

- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- Redis (v6 or higher)
- npm or yarn
- Docker (optional, for containerized deployment)

## Quick Start with Docker (Recommended)

The easiest way to deploy the entire application is with Docker Compose:

```bash
# 1. Clone the repository
git clone <repository-url>
cd chatApp

# 2. Create .env file from example
cp .env.example .env

# 3. Configure backend environment
cd backend
cp .env.example .env
# Update DATABASE_URL, JWT_SECRET, and other values in backend/.env

# 4. Return to root and start all services
cd ..
docker compose up -d --build
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5001
- **Health Check**: http://localhost:5001/api/health

### Docker Compose Services

| Service | Port | Description |
|---------|------|-------------|
| postgres | 5432 | PostgreSQL database |
| redis | 6379 | Redis cache/session store |
| backend | 5001 | Express + Socket.IO API server |
| frontend | 3000 | React static site (served by Node.js) |

### Stopping the Application

```bash
docker compose down
```

To also remove volumes (database data):
```bash
docker compose down -v
```

## Manual Installation (Without Docker)

### 1. Set Up PostgreSQL

Create a PostgreSQL database:

```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE wetalk;

# Exit
\q
```

### 2. Set Up Redis

Make sure Redis is running on your system:

```bash
# Windows (using WSL or Docker)
redis-server

# macOS (using Homebrew)
brew services start redis

# Linux
sudo systemctl start redis
```

### 3. Configure Backend

```bash
cd backend

# Install dependencies
npm install

# Create .env file (already created with default values)
# Update the DATABASE_URL in backend/.env with your PostgreSQL credentials
# DATABASE_URL="postgresql://username:password@localhost:5432/wetalk?schema=public"

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio to view database
npm run prisma:studio
```

### 4. Configure Frontend

```bash
cd frontend

# Install dependencies
npm install
```

## Running the Application

### Start Backend Server

```bash
cd backend

# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The backend server will run on `http://localhost:5001`

### Start Frontend Development Server

```bash
cd frontend

# Development mode
npm run dev
```

The frontend will run on `http://localhost:3000`

### Build Frontend for Production

```bash
cd frontend
npm run build
npm run preview
```

The production build will be in the `dist/` folder and can be served by any static file server.

## Project Structure

```
chatApp/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   ├── src/
│   │   ├── middleware/
│   │   │   └── auth.js            # Authentication middleware
│   │   ├── routes/
│   │   │   ├── auth.js            # Auth routes (login, register, logout)
│   │   │   ├── users.js           # User routes
│   │   │   ├── conversations.js   # Conversation routes
│   │   │   └── messages.js        # Message routes
│   │   ├── socket/
│   │   │   └── index.js           # Socket.IO handlers
│   │   ├── utils/
│   │   │   └── redis.js           # Redis utilities
│   │   └── server.js              # Express server entry point
│   ├── .env                       # Environment variables
│   ├── .env.example               # Environment variables template
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx         # Main layout wrapper
│   │   │   └── Sidebar.jsx        # Sidebar with conversations
│   │   ├── pages/
│   │   │   ├── Login.jsx          # Login page
│   │   │   ├── Register.jsx       # Registration page
│   │   │   └── Chat.jsx           # Main chat interface
│   │   ├── store/
│   │   │   ├── authStore.js       # Authentication state (Zustand)
│   │   │   └── chatStore.js       # Chat state (Zustand)
│   │   ├── App.jsx                # Main app component
│   │   ├── main.jsx               # Entry point
│   │   └── index.css              # Global styles
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
│
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users` - Get all users
- `GET /api/users/search?q=query` - Search users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/me` - Update current user profile
- `POST /api/users/online-status` - Get online status of users

### Conversations
- `GET /api/conversations` - Get all conversations
- `GET /api/conversations/:id` - Get conversation by ID
- `POST /api/conversations` - Create/get conversation
- `DELETE /api/conversations/:id` - Delete conversation

### Messages
- `GET /api/messages/conversation/:conversationId` - Get messages
- `POST /api/messages/conversation/:conversationId` - Send message
- `DELETE /api/messages/:id` - Delete message
- `GET /api/messages/unread/count` - Get unread count

## Socket.IO Events

### Client to Server
- `conversation:join` - Join a conversation room
- `conversation:leave` - Leave a conversation room
- `message:send` - Send a message
- `typing:start` - Start typing indicator
- `typing:stop` - Stop typing indicator
- `message:read` - Mark message as read

### Server to Client
- `message:new` - New message received
- `message:read` - Message read receipt
- `typing:update` - Typing status update
- `user:online` - User online/offline status
- `users:active` - List of active users
- `conversation:updated` - Conversation updated

## Environment Variables

### Backend (.env)
```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/wetalk?schema=public"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"

# Redis
REDIS_URL="redis://localhost:6379"

# Server
PORT=5001
NODE_ENV="development"

# Client URL
CLIENT_URL="http://localhost:3000"
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5001/api
VITE_SOCKET_URL=http://localhost:5001
```

## Database Schema

### User
- id, email, username, password, avatar, isOnline, lastSeen, timestamps

### Conversation
- id, user1Id, user2Id, timestamps

### Message
- id, conversationId, senderId, content, messageType, isRead, timestamps

### ReadReceipt
- id, messageId, userId, readAt

### TypingStatus
- id, userId, isTyping, updatedAt

## Features in Detail

### Real-time Messaging
- Messages are delivered instantly using Socket.IO
- Messages are persisted in PostgreSQL
- Real-time updates for all connected clients

### Online Status
- Users can see who's online in real-time
- Status updates broadcast to all connected clients
- Last seen timestamp for offline users

### Typing Indicators
- See when someone is typing a message
- Typing status automatically clears after 1 second of inactivity
- Typing status is broadcast to conversation participants

### Read Receipts
- Single checkmark (✓) for sent messages
- Double checkmark (✓✓) for read messages
- Read receipts update in real-time

### User Search
- Search users by username or email
- Start new conversations with search results
- Real-time search with minimum 2 characters

### Redis Caching
- User sessions cached for fast retrieval
- Online status cached with TTL
- Rate limiting for API endpoints
- Message caching for frequently accessed conversations

## Development

### Backend Scripts
```bash
npm run dev          # Start development server with nodemon
npm start            # Start production server
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run database migrations
npm run prisma:studio    # Open Prisma Studio
```

### Frontend Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

## Production Deployment

### Option 1: Docker Compose (Recommended)

```bash
# Build and start all services
docker compose up -d --build

# View logs
docker compose logs -f

# Stop services
docker compose down
```

### Option 2: Manual Deployment

#### Backend
1. Set `NODE_ENV=production`
2. Use a production PostgreSQL database
3. Use a managed Redis service (Redis Cloud, AWS ElastiCache)
4. Use a process manager like PM2
5. Set up environment variables securely

#### Frontend
1. Run `npm run build`
2. Deploy the `dist` folder to any static hosting service
3. The frontend is served directly by Node.js (no reverse proxy required)

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Input validation with Zod
- SQL injection prevention with Prisma
- CORS configuration
- Rate limiting with Redis

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License

## Support

For issues and questions, please open an issue on GitHub.