// Referral capture — FIRST-TOUCH attribution, persisted in localStorage for 90
// days. The user never sees or types a code; we read it from the `?ref=` URL
// param, validate its format, and store it. First-touch means: once a valid
// referral is stored and unexpired, later `?ref=` values are IGNORED, so the
// original reseller keeps ownership until the window lapses.
//
// localStorage (not a cookie) is the deliberate choice: the value is non-secret
// first-party attribution, must survive for 90 days, and must NOT be auto-sent
// with every request (it is attached explicitly only to the register call),
// which keeps it out of CSRF surface.

const STORAGE_KEY = 'qui.referral';
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// Mirrors the backend referralCodeRegex exactly (4–32 chars, upper alnum/_/-).
const CODE_RE = /^[A-Z0-9_-]{4,32}$/;

export interface StoredReferral {
  referralCode: string;
  capturedAt: number;
  expiresAt: number;
}

function readRaw(): StoredReferral | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredReferral>;
    if (
      typeof parsed?.referralCode !== 'string' ||
      typeof parsed?.expiresAt !== 'number' ||
      !CODE_RE.test(parsed.referralCode)
    ) {
      return null;
    }
    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as StoredReferral;
  } catch {
    return null;
  }
}

/**
 * Read `?ref=` from the URL (or a provided search string), validate its format,
 * and store it under first-touch rules. Safe to call on every public page load.
 */
export function captureReferralFromUrl(search: string = window.location.search): void {
  let code: string | null = null;
  try {
    code = new URLSearchParams(search).get('ref');
  } catch {
    return;
  }
  if (!code) return;

  const normalized = code.trim().toUpperCase();
  if (!CODE_RE.test(normalized)) return; // spoofed / malformed -> ignore silently

  // FIRST TOUCH: never overwrite a still-valid referral.
  if (readRaw()) return;

  const now = Date.now();
  const record: StoredReferral = {
    referralCode: normalized,
    capturedAt: now,
    expiresAt: now + NINETY_DAYS_MS
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* storage unavailable (private mode / quota) — attribution is best-effort */
  }
}

/** The stored, unexpired referral code, or undefined. Used by the register form. */
export function getStoredReferralCode(): string | undefined {
  return readRaw()?.referralCode ?? undefined;
}

/** The full stored record (code + timestamps), or null. */
export function getStoredReferral(): StoredReferral | null {
  return readRaw();
}

/** Clear the stored referral (e.g. after a successful, attributed sign-up). */
export function clearStoredReferral(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
