const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => console.error('Redis error:', err));
redisClient.on('connect', () => console.log('Redis connected'));

const cache = {
  async get(key) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  },
  async set(key, value, ttl = null) {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) await redisClient.setEx(key, ttl, serialized);
      else await redisClient.set(key, serialized);
      return true;
    } catch { return false; }
  },
  async del(key) {
    try { await redisClient.del(key); return true; } catch { return false; }
  },
  async delPattern(pattern) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) await redisClient.del(keys);
      return true;
    } catch { return false; }
  },
};

const session = {
  setUserSession: (userId, data, ttl = 7 * 24 * 60 * 60) =>
    cache.set(`session:user:${userId}`, data, ttl),
  getUserSession: (userId) => cache.get(`session:user:${userId}`),
  deleteUserSession: (userId) => cache.del(`session:user:${userId}`),
};

const presence = {
  setOnline: (userId, data) =>
    cache.set(`presence:${userId}`, { ...data, isOnline: true }, 300),
  setOffline: (userId) => cache.del(`presence:${userId}`),
  getStatus: (userId) => cache.get(`presence:${userId}`),
};

const rateLimit = {
  async check(userId, action, limit = 100, window = 60) {
    const key = `ratelimit:${userId}:${action}`;
    const current = await redisClient.incr(key);
    if (current === 1) await redisClient.expire(key, window);
    return { count: current, limit, remaining: Math.max(0, limit - current) };
  },
};

const messageCache = {
  set: (convId, messages) =>
    cache.set(`messages:${convId}`, messages, 300),
  get: (convId) => cache.get(`messages:${convId}`),
  invalidate: (convId) => cache.del(`messages:${convId}`),
};

const connect = async () => {
  await redisClient.connect();
};

const disconnect = async () => {
  await redisClient.quit();
};

module.exports = { redisClient, cache, session, presence, rateLimit, messageCache, connect, disconnect };
