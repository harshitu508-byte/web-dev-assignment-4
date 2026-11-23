// Integration tests. Needs a running MongoDB; uses a SEPARATE test database (wiped between tests).
// Set MONGO_URI_TEST in .env (database name must contain "test").
require('dotenv').config();
process.env.JWT_SECRET = 'test-secret-for-automated-tests';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = require('../app');
const User = require('../models/User');
const Note = require('../models/Note');

const MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/secure_connect_test';
let server;
let base;

before(async () => {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  if (!/test/i.test(mongoose.connection.name)) {
    await mongoose.disconnect();
    throw new Error(`Refusing to run: database "${mongoose.connection.name}" does not look like a test DB`);
  }
  await new Promise((resolve) => { server = http.createServer(app).listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Note.deleteMany({})]);
});

// ---------- helpers ----------
async function api(method, path, { body, token, rawBody, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json, headers: res.headers };
}

async function registerAndLogin(name = 'victor') {
  const creds = { username: name, email: `${name}@example.com`, password: '123456' };
  const s = await api('POST', '/api/auth/signup', { body: creds });
  const l = await api('POST', '/api/auth/login', { body: { email: creds.email, password: creds.password } });
  return { id: s.body.id, token: l.body.token, creds };
}

async function adminToken() {
  const user = await User.create({
    username: 'root', email: 'root@example.com', role: 'admin',
    password: await bcrypt.hash('AdminPass123!', 4),
  });
  return jwt.sign({ id: user._id, username: user.username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// ---------- signup ----------
describe('POST /api/auth/signup', () => {
  it('registers a user (201) without exposing the password', async () => {
    const r = await api('POST', '/api/auth/signup', { body: { username: 'victor', email: 'victor@example.com', password: '123456' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.message, 'User registered');
    assert.equal(r.body.username, 'victor');
    assert.ok(r.body.id);
    assert.equal(r.body.password, undefined);
  });

  it('stores a bcrypt hash, not the plain password', async () => {
    await api('POST', '/api/auth/signup', { body: { username: 'victor', email: 'victor@example.com', password: '123456' } });
    const user = await User.findOne({ email: 'victor@example.com' });
    assert.notEqual(user.password, '123456');
    assert.match(user.password, /^\$2[aby]\$/);
  });

  it('cannot self-assign the admin role', async () => {
    await api('POST', '/api/auth/signup', { body: { username: 'evil', email: 'evil@example.com', password: '123456', role: 'admin' } });
    assert.equal((await User.findOne({ email: 'evil@example.com' })).role, 'user');
  });

  it('cannot become admin by using any particular email', async () => {
    await api('POST', '/api/auth/signup', { body: { username: 'a', email: 'admin@example.com', password: '123456' } });
    assert.equal((await User.findOne({ email: 'admin@example.com' })).role, 'user');
  });

  it('rejects missing fields (400)', async () => {
    const r = await api('POST', '/api/auth/signup', { body: { username: 'x' } });
    assert.equal(r.status, 400);
  });

  it('rejects short passwords (400)', async () => {
    const r = await api('POST', '/api/auth/signup', { body: { username: 'x', email: 'x@example.com', password: '123' } });
    assert.equal(r.status, 400);
  });

  it('rejects non-string / injection-style values (400)', async () => {
    const r = await api('POST', '/api/auth/signup', { body: { username: 'x', email: { $ne: null }, password: '123456' } });
    assert.equal(r.status, 400);
  });

  it('rejects duplicate email (409)', async () => {
    await registerAndLogin('victor');
    const r = await api('POST', '/api/auth/signup', { body: { username: 'other', email: 'victor@example.com', password: '123456' } });
    assert.equal(r.status, 409);
  });
});

// ---------- login ----------
describe('POST /api/auth/login', () => {
  it('returns a valid JWT (200)', async () => {
    const { token, id } = await registerAndLogin();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(decoded.id, id);
    assert.equal(decoded.role, 'user');
    assert.equal(decoded.password, undefined);
  });

  it('sets an httpOnly, SameSite=Strict cookie (not Secure outside production)', async () => {
    await registerAndLogin();
    const r = await api('POST', '/api/auth/login', { body: { email: 'victor@example.com', password: '123456' } });
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /token=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.doesNotMatch(cookie, /;\s*Secure/i);
  });

  it('marks the cookie Secure in production', async () => {
    await registerAndLogin();
    process.env.NODE_ENV = 'production';
    try {
      const r = await api('POST', '/api/auth/login', { body: { email: 'victor@example.com', password: '123456' } });
      assert.match(r.headers.get('set-cookie'), /;\s*Secure/i);
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });

  it('rejects a wrong password (401)', async () => {
    await registerAndLogin();
    const r = await api('POST', '/api/auth/login', { body: { email: 'victor@example.com', password: 'wrong-pass' } });
    assert.equal(r.status, 401);
    assert.equal(r.body.message, 'Invalid credentials');
  });

  it('gives the same 401 for an unknown email (no user enumeration)', async () => {
    const r = await api('POST', '/api/auth/login', { body: { email: 'nobody@example.com', password: '123456' } });
    assert.equal(r.status, 401);
    assert.equal(r.body.message, 'Invalid credentials');
  });

  it('rejects injection-style login bodies (400)', async () => {
    const r = await api('POST', '/api/auth/login', { body: { email: { $gt: '' }, password: { $gt: '' } } });
    assert.equal(r.status, 400);
  });
});

// ---------- JWT handling ----------
describe('JWT verification', () => {
  it('rejects a garbage token (401)', async () => {
    const r = await api('GET', '/api/notes', { token: 'not.a.jwt' });
    assert.equal(r.status, 401);
  });

  it('rejects a token signed with the wrong secret (401)', async () => {
    const forged = jwt.sign({ id: '507f1f77bcf86cd799439011', role: 'admin' }, 'some-other-secret');
    const r = await api('GET', '/api/admin/users', { token: forged });
    assert.equal(r.status, 401);
  });

  it('rejects an expired token (401)', async () => {
    const expired = jwt.sign({ id: '507f1f77bcf86cd799439011', role: 'user' }, process.env.JWT_SECRET, { expiresIn: -10 });
    const r = await api('GET', '/api/notes', { token: expired });
    assert.equal(r.status, 401);
  });

  it('accepts the token from the cookie', async () => {
    const { token } = await registerAndLogin();
    const r = await api('GET', '/api/profile', { headers: { Cookie: `token=${token}` } });
    assert.equal(r.status, 200);
    assert.equal(r.body.email, 'victor@example.com');
    assert.equal(r.body.password, undefined);
  });
});

// ---------- notes ----------
describe('Notes API', () => {
  it('blocks access without a token (403 "No token provided")', async () => {
    for (const [method, path] of [['GET', '/api/notes'], ['POST', '/api/notes'], ['GET', '/api/notes/507f1f77bcf86cd799439011']]) {
      const r = await api(method, path, { body: method === 'POST' ? { title: 't', content: 'c' } : undefined });
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.body.message, 'No token provided');
    }
  });

  it('supports the full CRUD cycle', async () => {
    const { token, id } = await registerAndLogin();

    const created = await api('POST', '/api/notes', { token, body: { title: 'My First Note', content: 'hello' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.owner, id);
    const noteId = created.body._id;

    const list = await api('GET', '/api/notes', { token });
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);

    const one = await api('GET', `/api/notes/${noteId}`, { token });
    assert.equal(one.status, 200);
    assert.equal(one.body.title, 'My First Note');

    const updated = await api('PUT', `/api/notes/${noteId}`, { token, body: { content: 'edited' } });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.content, 'edited');
    assert.equal(updated.body.title, 'My First Note');

    const del = await api('DELETE', `/api/notes/${noteId}`, { token });
    assert.equal(del.status, 200);
    assert.equal((await api('GET', `/api/notes/${noteId}`, { token })).status, 404);
  });

  it('validates input (400)', async () => {
    const { token } = await registerAndLogin();
    assert.equal((await api('POST', '/api/notes', { token, body: { title: 'only title' } })).status, 400);
    assert.equal((await api('POST', '/api/notes', { token, body: { title: { x: 1 }, content: 'c' } })).status, 400);
    assert.equal((await api('GET', '/api/notes/not-an-id', { token })).status, 400);
    assert.equal((await api('PUT', '/api/notes/507f1f77bcf86cd799439011', { token, body: {} })).status, 400);
  });

  it('returns 404 for a note that does not exist', async () => {
    const { token } = await registerAndLogin();
    assert.equal((await api('GET', '/api/notes/507f1f77bcf86cd799439011', { token })).status, 404);
  });

  it("does not let a user see, edit or delete someone else's note", async () => {
    const alice = await registerAndLogin('alice');
    const bob = await registerAndLogin('bob');
    const note = await api('POST', '/api/notes', { token: alice.token, body: { title: 'secret', content: 'alice only' } });
    const id = note.body._id;

    assert.equal((await api('GET', '/api/notes', { token: bob.token })).body.length, 0);
    assert.equal((await api('GET', `/api/notes/${id}`, { token: bob.token })).status, 404);
    assert.equal((await api('PUT', `/api/notes/${id}`, { token: bob.token, body: { title: 'hacked' } })).status, 404);
    assert.equal((await api('DELETE', `/api/notes/${id}`, { token: bob.token })).status, 404);
    assert.equal((await Note.findById(id)).title, 'secret');
  });
});

// ---------- admin RBAC ----------
describe('Admin-only routes', () => {
  it('rejects requests without a token (403)', async () => {
    assert.equal((await api('GET', '/api/admin/users')).status, 403);
  });

  it('rejects a normal user (403)', async () => {
    const { token } = await registerAndLogin();
    for (const path of ['/api/admin/users', '/api/admin/notes']) {
      const r = await api('GET', path, { token });
      assert.equal(r.status, 403);
    }
  });

  it('allows an admin and never returns password hashes', async () => {
    const user = await registerAndLogin();
    await api('POST', '/api/notes', { token: user.token, body: { title: 't', content: 'c' } });
    const token = await adminToken();

    const users = await api('GET', '/api/admin/users', { token });
    assert.equal(users.status, 200);
    assert.equal(users.body.length, 2);
    assert.ok(users.body.every((u) => u.password === undefined));

    const notes = await api('GET', '/api/admin/notes', { token });
    assert.equal(notes.status, 200);
    assert.equal(notes.body.length, 1);
  });
});

// ---------- centralized error handling ----------
describe('Error handling', () => {
  it('returns 400 for malformed JSON', async () => {
    const r = await api('POST', '/api/auth/login', { rawBody: '{ bad json' });
    assert.equal(r.status, 400);
  });

  it('returns 404 JSON for unknown routes', async () => {
    const r = await api('GET', '/api/nope');
    assert.equal(r.status, 404);
  });

  it('turns async database failures into a 500 response (no crash, no leak)', async (t) => {
    const { token } = await registerAndLogin();
    t.mock.method(console, 'error', () => {});
    t.mock.method(Note, 'create', async () => { throw new Error('db exploded: secret internals'); });
    const r = await api('POST', '/api/notes', { token, body: { title: 't', content: 'c' } });
    assert.equal(r.status, 500);
    assert.equal(r.body.message, 'Internal server error');
    assert.doesNotMatch(JSON.stringify(r.body), /secret internals/);
  });
});
