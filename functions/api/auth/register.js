import { hashPassword, isSameOrigin, json, normalizeEmail, nowIso, readJson, validEmail, validatePassword } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: "Neplatný původ požadavku." }, 403);
  const body = await readJson(request);
  if (!body) return json({ error: "Neplatná data." }, 400);

  const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim();
  const passwordError = validatePassword(body.password);
  if (!validEmail(email) || name.length < 2 || name.length > 80 || passwordError) {
    return json({ error: passwordError || "Zkontrolujte jméno a e-mail." }, 400);
  }

  const existing = await env.DB.prepare("SELECT status FROM users WHERE email = ?").bind(email).first();
  if (existing) return json({ error: "Registrace s tímto e-mailem už existuje." }, 409);

  const credentials = await hashPassword(body.password);
  const createdAt = nowIso();
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (id, email, name, password_hash, password_salt, role, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'user', 'pending', ?)
    `).bind(id, email, name, credentials.hash, credentials.salt, createdAt),
    env.DB.prepare("INSERT INTO audit_log (id, action, target_user_id, created_at) VALUES (?, 'registration_created', ?, ?)")
      .bind(crypto.randomUUID(), id, createdAt),
  ]);
  return json({ ok: true, message: "Registrace čeká na schválení administrátorem." }, 201);
}
