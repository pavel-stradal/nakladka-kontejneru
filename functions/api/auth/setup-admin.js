import { hashPassword, isSameOrigin, json, normalizeEmail, nowIso, readJson, validEmail, validatePassword, verifySetupKey } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: "Neplatný původ požadavku." }, 403);
  const body = await readJson(request);
  if (!body) return json({ error: "Neplatná data." }, 400);

  const initialized = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_initialized'").first();
  if (initialized?.value === "true") return json({ error: "Administrátor už je nastaven." }, 409);
  if (!await verifySetupKey(body.setupKey, env.ADMIN_SETUP_KEY)) return json({ error: "Neplatný jednorázový klíč." }, 403);

  const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim();
  const passwordError = validatePassword(body.password);
  if (!validEmail(email) || name.length < 2 || name.length > 80 || passwordError) {
    return json({ error: passwordError || "Zkontrolujte jméno a e-mail." }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const credentials = await hashPassword(body.password);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (id, email, name, password_hash, password_salt, role, status, created_at, approved_at)
      VALUES (?, ?, ?, ?, ?, 'admin', 'active', ?, ?)
      ON CONFLICT(email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash,
        password_salt = excluded.password_salt, role = 'admin', status = 'active', approved_at = excluded.approved_at
    `).bind(id, email, name, credentials.hash, credentials.salt, createdAt, createdAt),
    env.DB.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('admin_initialized', 'true', ?)").bind(createdAt),
    env.DB.prepare("INSERT INTO audit_log (id, action, detail, created_at) VALUES (?, 'admin_initialized', ?, ?)")
      .bind(crypto.randomUUID(), email, createdAt),
  ]);
  return json({ ok: true });
}
