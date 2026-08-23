const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../config/db');

const registerSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  username: z.string().min(3).max(30),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string(),
});

const signToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const checkUsername = async (req, res) => {
  const username = String(req.query.username || '').trim();
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    return res.json({ available: false, valid: false });
  }
  const existing = await prisma.user.findFirst({
    where: { username, isDeleted: false },
    select: { id: true },
  });
  res.json({ available: !existing, valid: true });
};

// Common disposable/temp email domains to reject
const DISPOSABLE_DOMAINS = [
  'mailinator.com','yopmail.com','guerrillamail.com','sharklasers.com',
  'temp-mail.org','tempmail.com','throwawaymail.com','10minutemail.com',
  'maildrop.cc','getnada.com','dispostable.com','mailnesia.com',
  'fakeinbox.com','mintemail.com','trashmail.com','spamgourmet.com',
  'mailcatch.com','mytemp.email','tempinbox.com','emailondeck.com',
  'mailtemp.net','tmail.ws','tempail.com','tempr.email','fakemail.net',
  'mailmetrash.com','mailmoat.com','mailsac.com','spam4.me','tmpmail.org',
  'emailfake.com','fakemailgenerator.com','mailforspam.com','mohmal.com',
  'mohmal.in','mohmal.tech','mohmal.site','mohmal.xyz','mohmal.icu',
  'mohmal.cyou','mohmal.ga','mohmal.gq','mohmal.ml','mohmal.tk',
  'mohmal.cf','mohmal.ovh','throwaway.email','emailtemporario.com.br',
  'mail-temporaire.fr','temporary-mail.net','tmpmail.net','tmpmail.io',
  'emailnator.com','mailinator2.com','tempinbox.com','drugsmile.com',
];

// Validate email domain via DNS MX record lookup
async function validateEmailDomain(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return { valid: false, reason: 'Invalid email' };

  // Check disposable domain list
  if (DISPOSABLE_DOMAINS.includes(domain)) {
    return { valid: false, reason: 'Disposable email addresses are not allowed' };
  }

  // Check for common fake patterns
  if (/\.(local|test|example|invalid)$/.test(domain)) {
    return { valid: false, reason: 'Email domain is not valid' };
  }

  // If SKIP_DNS_CHECK is set (dev mode without internet), skip DNS verification
  if (process.env.SKIP_DNS_CHECK === 'true') {
    return { valid: true, domain };
  }

  // Check DNS MX records - verifies the domain actually can receive email
  try {
    const addresses = await dns.resolveMx(domain);
    if (!addresses || addresses.length === 0) {
      return { valid: false, reason: 'Enter a valid email address with a working mail domain' };
    }
    return { valid: true, domain };
  } catch (error) {
    // DNS lookup failed
    try {
      await dns.resolve4(domain);
      return { valid: true, domain };
    } catch {
      return { valid: false, reason: 'Email domain does not exist' };
    }
  }
}

const register = async (req, res) => {
  try {
    const { email, username, password } = registerSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: normalizedEmail }, { username }] },
    });
    if (existing) {
      return res.status(400).json({
        error: existing.email === normalizedEmail ? 'Email already registered' : 'Username already taken',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        username,
        password: hashedPassword,
        isEmailVerified: true,
        isOnline: true,
      },
      select: {
        id: true, email: true, username: true, avatar: true,
        isOnline: true, lastSeen: true, isEmailVerified: true,
        createdAt: true, updatedAt: true,
      },
    });

    const token = signToken(user.id);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(201).json({
      message: 'User registered successfully.',
      user,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    await prisma.user.update({ where: { id: user.id }, data: { isOnline: true } });

    const { password: _, ...userWithoutPassword } = user;
    const token = signToken(user.id);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ message: 'Login successful', user: userWithoutPassword });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await prisma.user.update({
          where: { id: decoded.userId },
          data: { isOnline: false, lastSeen: new Date() },
        });
      } catch { /* invalid token — still logout */ }
    }
    res.clearCookie('token');
    res.json({ message: 'Logout successful' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
};

const me = async (req, res) => {
  res.json({ user: req.user });
};

module.exports = { register, login, logout, me, checkUsername };