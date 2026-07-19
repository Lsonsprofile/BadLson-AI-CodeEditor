import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

// Development user for testing
const DEV_USER = {
  id: 'dev-user-123',
  email: 'dev@example.com',
  name: 'Developer',
  role: 'admin',
  isDevUser: true
};

/**
 * Authentication middleware - verifies JWT token
 */
export function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  // Development mode - allow bypass with SKIP_AUTH flag
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    console.warn('⚠️ Development mode: Skipping authentication');
    req.user = DEV_USER;
    req.isAuthenticated = false;
    req.authMode = 'development';
    return next();
  }

  // Production mode - require valid token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No valid authentication token provided',
      code: 'auth/no-token'
    });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    // Verify the JWT token
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token payload',
        code: 'auth/invalid-token'
      });
    }

    // Attach user to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      name: decoded.name || decoded.email || 'User',
      role: decoded.role || 'user'
    };
    req.isAuthenticated = true;
    req.authMode = 'jwt';
    req.tokenPayload = decoded;

    console.log(`✅ Auth successful: ${req.user.email} (${req.user.id})`);
    next();

  } catch (error) {
    console.error('❌ Auth error:', error.message);

    // Handle specific JWT errors
    const errorMap = {
      'TokenExpiredError': {
        status: 401,
        code: 'auth/token-expired',
        message: 'Authentication token has expired. Please sign in again.'
      },
      'JsonWebTokenError': {
        status: 401,
        code: 'auth/invalid-token',
        message: 'Invalid authentication token'
      },
      'NotBeforeError': {
        status: 401,
        code: 'auth/token-not-active',
        message: 'Token is not yet active'
      }
    };

    const errorResponse = errorMap[error.name] || {
      status: 401,
      code: 'auth/unknown',
      message: 'Authentication failed. Please ensure you are signed in.'
    };

    res.status(errorResponse.status).json({
      error: 'Unauthorized',
      message: errorResponse.message,
      code: errorResponse.code
    });
  }
}

/**
 * Optional: Middleware to require specific role
 */
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.isAuthenticated) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Required role: ${role}`
      });
    }

    next();
  };
}

export default { verifyAuth, requireRole };