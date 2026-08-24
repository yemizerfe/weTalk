# weTalk chat app

A real-time one-to-one chat application built for simple and fast
communication.

weTalk allows users to find other users, start private conversations, send
messages in real time, see online status, know when someone is typing, and
see when messages have been read.

## Features

- JWT-based authentication
- Real-time one-to-one messaging
- Online and offline status
- Typing indicators
- Real-time read receipts
- User search
- Private conversation management
- Redis caching and session management
- Responsive interface

## Tech Stack

### Frontend

- React 18
- Vite
- React Router
- Zustand
- Axios
- Tailwind CSS
- Socket.IO Client
- Lucide React
- date-fns

### Backend

- Node.js
- Express.js
- Socket.IO
- Prisma
- PostgreSQL
- Redis
- JWT
- bcrypt
- Zod

## How It Works

The application uses a REST API for operations such as authentication,
user management, conversations, and message history.

Socket.IO handles real-time communication between connected users. When a
message is sent, the server delivers it to the other participant immediately
while also persisting it in PostgreSQL.

Redis is used for fast-access data such as sessions, online presence,
caching, and rate limiting.

## Project Structure

```text
weTalk/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── middleware/
│       ├── routes/
│       ├── socket/
│       ├── utils/
│       └── server.js
│
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── store/
│       ├── App.jsx
│       └── main.jsx
│
├── .env.example
└── README.md
```
## Getting Started

### Prerequisites

Make sure you have the following installed:

- Git
- Docker
- Docker Compose

### Installation

Clone the repository:

```bash
git clone https://github.com/yemizerfe/weTalk.git
cd weTalk
docker compose up
