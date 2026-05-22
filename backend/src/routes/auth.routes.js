import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth, requireAdmin, signAuthToken } from '../middleware/auth.js';
import { validateLoginInput, validateCreateUserInput } from '../utils/validate.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = validateLoginInput(req.body);

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user || !user.active) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await user.verifyPassword(password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signAuthToken(user);
    res.json({
      token,
      user: { id: user._id, name: user.name, username: user.username, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name, username, password, role } = validateCreateUserInput(req.body);
    const exists = await User.findOne({ username });
    if (exists)
      return res
        .status(409)
        .json({ error: 'Username already taken', fields: { username: 'Already taken' } });

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      name,
      username,
      passwordHash,
      role,
    });
    res.status(201).json({
      user: { id: user._id, name: user.name, username: user.username, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/users', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// Toggle (or set) a user's active flag. Admins cannot deactivate themselves.
router.patch('/users/:id/active', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ error: 'Apne aap ko deactivate nahi kar sakte' });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const next = typeof req.body.active === 'boolean' ? req.body.active : !target.active;
    target.active = next;
    await target.save();

    res.json({
      user: {
        id: target._id,
        name: target.name,
        username: target.username,
        role: target.role,
        active: target.active,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
