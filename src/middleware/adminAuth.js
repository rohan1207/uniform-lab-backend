const jwt = require('jsonwebtoken');

function adminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    const payload = jwt.verify(token, secret);
    req.admin = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    return next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Admin auth failed', err.message);
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }
}

module.exports = adminAuth;

