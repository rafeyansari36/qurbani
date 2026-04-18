import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

export function signAuthToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

/**
 * Verifies the Bearer token, attaches `req.user`, and issues a refreshed token
 * as `X-Refreshed-Token` response header — any successful authenticated request
 * slides the session forward. If the user is idle (no requests) for 15 minutes,
 * the token expires and they are forced to log in again.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Token missing' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select('-passwordHash');
    if (!user || !user.active) return res.status(401).json({ error: 'Invalid user' });

    req.user = user;

    // Sliding expiration — issue a fresh token on every successful authed request
    const fresh = signAuthToken(user);
    res.setHeader('X-Refreshed-Token', fresh);
    res.setHeader('Access-Control-Expose-Headers', 'X-Refreshed-Token');

    next();
  } catch (err) {
    const expired = err?.name === 'TokenExpiredError';
    return res.status(401).json({
      error: expired ? 'Session expired' : 'Invalid or expired token',
      code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}
