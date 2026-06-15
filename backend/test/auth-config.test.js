import assert from 'node:assert/strict';
import test from 'node:test';

const originalJwtSecret = process.env.JWT_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

const restoreEnv = () => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }

  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
};

test.afterEach(() => {
  restoreEnv();
});

test('getJwtSecret returns configured JWT_SECRET', async () => {
  process.env.JWT_SECRET = ['configured', 'secret'].join('-');
  process.env.NODE_ENV = 'production';

  const { getJwtSecret } = await import(`../src/utils/auth-config.js?configured=${Date.now()}`);

  assert.equal(getJwtSecret(), 'configured-secret');
});

test('getJwtSecret throws in production when JWT_SECRET is missing', async () => {
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';

  const { getJwtSecret } = await import(`../src/utils/auth-config.js?missing=${Date.now()}`);

  assert.throws(
    () => getJwtSecret(),
    /JWT_SECRET is required in production/
  );
});

test('getJwtSecret uses a development-only fallback outside production', async () => {
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = 'development';

  const { getJwtSecret } = await import(`../src/utils/auth-config.js?dev=${Date.now()}`);

  assert.equal(getJwtSecret(), 'development-only-jwt-secret-change-me');
});

test('getJwtSecret uses development-only fallback when NODE_ENV is unset', async () => {
  delete process.env.JWT_SECRET;
  delete process.env.NODE_ENV;

  const { getJwtSecret } = await import(`../src/utils/auth-config.js?unset=${Date.now()}`);

  assert.equal(getJwtSecret(), 'development-only-jwt-secret-change-me');
});
