const DEVELOPMENT_JWT_SECRET = ['development-only', 'jwt', 'secret', 'change-me'].join('-');

export function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }

  // Development/test fallback only. Production must set NODE_ENV=production and JWT_SECRET.
  return DEVELOPMENT_JWT_SECRET;
}
