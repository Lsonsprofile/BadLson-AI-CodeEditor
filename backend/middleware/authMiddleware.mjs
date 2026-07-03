export function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (process.env.NODE_ENV === 'production') {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }
  }

  req.user = {
    uid: 'dev-user-123',
    email: 'dev@example.com',
    name: 'Developer',
  };

  next();
}
