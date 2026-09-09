const PIN_SALT = 'mapcam-admin-v1';
const PIN_DIGEST = '1c981efa8c907718ef716272f8d69f61e058aadb14853c82ebe2d35f54c580bc';
const SESSION_KEY = 'mapcam-admin-unlocked';
const ATTEMPT_KEY = 'mapcam-admin-attempts';
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30_000;

export async function verifyAdminPin(pin) {
  const value = String(pin ?? '').trim();
  if (!/^\d{6}$/.test(value)) return false;
  const bytes = new TextEncoder().encode(`${PIN_SALT}:${value}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const actual = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(actual, PIN_DIGEST);
}

export function isAdminUnlocked() {
  try { return sessionStorage.getItem(SESSION_KEY) === 'yes'; }
  catch { return false; }
}

export function unlockAdminSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, 'yes');
    sessionStorage.removeItem(ATTEMPT_KEY);
  } catch { /* Session storage may be unavailable in private WebViews. */ }
}

export function lockAdminSession() {
  try { sessionStorage.removeItem(SESSION_KEY); }
  catch { /* No-op. */ }
}

export function getAdminAttemptState(now = Date.now()) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || '{}');
    const lockedUntil = Number(stored.lockedUntil) || 0;
    if (lockedUntil > now) return { attempts: MAX_ATTEMPTS, lockedUntil, remainingMs: lockedUntil - now };
    if (lockedUntil) sessionStorage.removeItem(ATTEMPT_KEY);
    return { attempts: Number(stored.attempts) || 0, lockedUntil: 0, remainingMs: 0 };
  } catch { return { attempts: 0, lockedUntil: 0, remainingMs: 0 }; }
}

export function recordAdminFailure(now = Date.now()) {
  const current = getAdminAttemptState(now);
  const attempts = current.attempts + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? now + LOCK_DURATION_MS : 0;
  try { sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ attempts: lockedUntil ? 0 : attempts, lockedUntil })); }
  catch { /* No-op. */ }
  return { attempts, lockedUntil, remainingMs: Math.max(0, lockedUntil - now) };
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
