import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyAuth } from '../middleware/authMiddleware.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';
const SALT_ROUNDS = 10;

// In-memory user store (replace with database in production)
const users = new Map();

// Initialize with default admin user (development only)
if (process.env.NODE_ENV !== 'production') {
  const defaultEmail = 'admin@example.com';
  const defaultPassword = process.env.DEFAULT_PASSWORD || 'admin123';
  
  if (!users.has(defaultEmail)) {
    const hashedPassword = bcrypt.hashSync(defaultPassword, SALT_ROUNDS);
    users.set(defaultEmail, {
      id: uuidv4(),
      email: defaultEmail,
      password: hashedPassword,
      name: 'Administrator',
      role: 'admin',
      createdAt: new Date().toISOString()
    });
    console.log('✅ Default admin user created: admin@example.com / ' + defaultPassword);
  }
}

/**
 * Generate JWT token
 */
function generateToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'user'
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Hash password
 */
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare password with hash
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Get user by email
 */
function getUserByEmail(email) {
  const user = users.get(email);
  if (!user) return null;
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// ─── ROUTES ──────────────────────────────────────────────────────────

/**
 * Register a new user
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Email and password are required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Invalid password',
        message: 'Password must be at least 8 characters'
      });
    }

    if (users.has(email)) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'An account with this email already exists'
      });
    }

    const hashedPassword = await hashPassword(password);
    const user = {
      id: uuidv4(),
      email,
      password: hashedPassword,
      name: name || email.split('@')[0],
      role: 'user',
      createdAt: new Date().toISOString()
    };

    users.set(email, user);
    const token = generateToken(user);
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      message: 'User created successfully',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * Login
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Email and password are required'
      });
    }

    const user = users.get(email);
    if (!user) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password'
      });
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password'
      });
    }

    const token = generateToken(user);
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
router.get('/me', verifyAuth, (req, res) => {
  res.json({
    user: req.user
  });
});

/**
 * Logout (client-side)
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  res.json({
    message: 'Logout successful'
  });
});

/**
 * Get all users (admin only)
 * GET /api/auth/users
 */
router.get('/users', verifyAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }

  const allUsers = Array.from(users.values()).map(({ password, ...user }) => user);
  res.json({
    users: allUsers
  });
});

export default router;