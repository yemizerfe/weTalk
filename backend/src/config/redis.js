
const { createClient } = require('redis');

const redisUrl = process.env.REDIS_URL;

const redisClient = createClient({
  url: redisUrl || 'redis://localhost:6379',

  socket: {
    connectTimeout: 10000,

    reconnectStrategy(retries) {
      if (retries > 5) {
        console.error(
          'Redis: Maximum reconnection attempts reached. Check REDIS_URL and credentials.'
        );
        return new Error('Redis reconnection limit reached');
      }

      return Math.min(retries * 1000, 5000);
    },
  },
});

// Log errors without exposing credentials.
redisClient.on('error', (err) => {
  console.error('Redis client error:', err.message);
});

// "connect" alone does not confirm authentication.
redisClient.on('ready', () => {
  console.log('Redis is ready to accept commands.');
});

redisClient.on('reconnecting', () => {
  console.log('Redis reconnecting...');
});

redisClient.on('end', () => {
  console.log('Redis connection closed.');
});

const cache = {
  async get(key) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error('Cache get failed:', err.message);
      return null;
    }
  },

  async set(key, value, ttl = null) {
    try {
      const serialized = JSON.stringify(value);

      if (ttl) {
        await redisClient.setEx(key, ttl, serialized);
      } else {
        await redisClient.set(key, serialized);
      }

      return true;
    } catch (err) {
      console.error('Cache set failed:', err.message);
      return false;
    }
  },

  async del(key) {
    try {
      await redisClient.del(key);
      return true;
    } catch (err) {
      console.error('Cache delete failed:', err.message);
      return false;
    }
  },

  async delPattern(pattern) {
    try {
      const keys = [];

      for await (const key of redisClient.scanIterator({
        MATCH: pattern,
        COUNT: 100,
      })) {
        keys.push(key);
      }

      if (keys.length > 0) {
        await redisClient.del(keys);
      }

      return true;
    } catch (err) {
      console.error('Cache pattern delete failed:', err.message);
      return false;
    }
  },
};

const session = {
  setUserSession: (userId, data, ttl = 7 * 24 * 60 * 60) =>
    cache.set(`session:user:${userId}`, data, ttl),

  getUserSession: (userId) =>
    cache.get(`session:user:${userId}`),

  deleteUserSession: (userId) =>
    cache.del(`session:user:${userId}`),
};

const presence = {
  setOnline: (userId, data) =>
    cache.set(
      `presence:${userId}`,
      { ...data, isOnline: true },
      300
    ),

  setOffline: (userId) =>
    cache.del(`presence:${userId}`),

  getStatus: (userId) =>
    cache.get(`presence:${userId}`),
};

const rateLimit = {
  async check(userId, action, limit = 100, window = 60) {
    const key = `ratelimit:${userId}:${action}`;

    const current = await redisClient.incr(key);

    if (current === 1) {
      await redisClient.expire(key, window);
    }

    return {
      count: current,
      limit,
      remaining: Math.max(0, limit - current),
    };
  },
};

const messageCache = {
  set: (convId, messages) =>
    cache.set(`messages:${convId}`, messages, 300),

  get: (convId) =>
    cache.get(`messages:${convId}`),

  invalidate: (convId) =>
    cache.del(`messages:${convId}`),
};

const connect = async () => {
  if (!redisUrl) {
    console.error(
      'REDIS_URL is missing. Configure it in your deployment environment.'
    );
    return false;
  }

  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    // Confirm that authentication and a Redis command succeed.
    await redisClient.ping();

    console.log('Redis connection and authentication verified.');
    return true;
  } catch (err) {
    console.error('Redis initialization failed:', err.message);
    return false;
  }
};

const disconnect = async () => {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  } catch (err) {
    console.error('Redis shutdown failed:', err.message);
  }
};

module.exports = {
  redisClient,
  cache,
  session,
  presence,
  rateLimit,
  messageCache,
  connect,
  disconnect,
};
