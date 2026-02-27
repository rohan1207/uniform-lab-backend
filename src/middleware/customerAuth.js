const jwt = require('jsonwebtoken');

function customerAuth(req, res, next) {
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
    req.customer = {
      id: payload.sub,
      email: payload.email,
    };
    return next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Customer auth failed', err.message);
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }
}

module.exports = customerAuth;

