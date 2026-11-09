import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64, options);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded || '')) return false;
  const [, salt, hash] = encoded.split(':');
  const actual = await derive(password, salt, 64, options);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
const digest = token => createHash('sha256').update(token).digest('hex');

export function installAuth(app, db, { username = 'admin', passwordHash, secure = false } = {}) {
  const enabled = Boolean(passwordHash);
  if (enabled && !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash)) throw new Error('ADMIN_PASSWORD_HASH no válido.');
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);`);
  const cookieName = secure ? '__Host-dropea_session' : 'dropea_session';
  const cookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  let inFlight = 0;
  const tokenFrom = req => {
    const raw = (req.get('cookie') || '').split(';').map(c => c.trim()).find(c => c.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    return raw && /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : null;
  };
  const authenticated = req => {
    if (!enabled) return true;
    const token = tokenFrom(req);
    return Boolean(token && db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires>?').get(digest(token), Date.now()));
  };
  app.get('/api/auth/session', (req, res) => res.json({ enabled, authenticated: authenticated(req), username: authenticated(req) ? username : null }));
  app.post('/api/auth/login', async (req, res, next) => {
    if (!enabled) return res.json({ authenticated: true });
    const { username: name, password, remember } = req.body || {};
    if (typeof name !== 'string' || typeof password !== 'string' || name.length > 100 || !password || password.length > 512) return res.status(400).json({ error: 'Ingresa tu usuario y contraseña.' });
    const ip = (req.get('x-real-ip') || req.socket.remoteAddress || 'local').slice(0, 100);
    const now = Date.now();
    db.prepare('DELETE FROM login_attempts WHERE reset_at<=?').run(now);
    const attempts = db.prepare('SELECT attempts FROM login_attempts WHERE ip=?').get(ip)?.attempts || 0;
    if (attempts >= 10 || inFlight >= 4) return res.status(429).set('Retry-After', '900').json({ error: 'Demasiados intentos. Vuelve a intentarlo en 15 minutos.' });
    db.prepare('INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(ip) DO UPDATE SET attempts=attempts+1').run(ip, now + 15 * 60 * 1000);
    inFlight++;
    try {
      const valid = await verifyPassword(password, passwordHash);
      if (!valid || name !== username) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      db.prepare('DELETE FROM login_attempts WHERE ip=?').run(ip);
      db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
      // Rotate an existing browser session instead of retaining an old token.
      const old = tokenFrom(req);
      if (old) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(old));
      const token = randomBytes(32).toString('base64url');
      const lifetime = remember === true ? 7 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
      db.prepare('INSERT INTO sessions VALUES (?,?)').run(digest(token), now + lifetime);
      res.cookie(cookieName, token, { ...cookieOptions, ...(remember === true ? { maxAge: lifetime } : {}) });
      res.json({ authenticated: true, username });
    } catch (err) { next(err); }
    finally { inFlight--; }
  });
  app.post('/api/auth/logout', (req, res) => {
    const token = tokenFrom(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
    res.clearCookie(cookieName, cookieOptions);
    res.json({ authenticated: false });
  });
  app.use('/api', (req, res, next) => authenticated(req) ? next() : res.status(401).json({ code: 'SESSION_REQUIRED', error: 'Inicia sesión para continuar.' }));
}
