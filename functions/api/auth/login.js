import { createSession, isSameOrigin, json, normalizeEmail, nowIso, readJson, verifyPassword } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: "Neplatný původ požadavku." }, 403);
  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return json({ error: "Zadejte e-mail a heslo." }, 400);

  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  const now = Math.floor(Date.now() / 1000);
  if (user?.locked_until > now) return json({ error: "Příliš mnoho pokusů. Přihlášení je na 15 minut uzamčeno." }, 429);

  const valid = user ? await verifyPassword(password, user.password_salt, user.password_hash) : false;
  if (!user || !valid) {
    if (user) {
      const failed = Number(user.failed_logins || 0) + 1;
      await env.DB.prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?")
        .bind(failed >= 5 ? 0 : failed, failed >= 5 ? now + 900 : 0, user.id).run();
    }
    return json({ error: "Neplatný e-mail nebo heslo." }, 401);
  }
  if (user.status === "pending") return json({ error: "Registrace zatím čeká na schválení administrátorem." }, 403);
  if (user.status !== "active") return json({ error: "Účet není aktivní." }, 403);

  const loggedAt = nowIso();
  await env.DB.prepare("UPDATE users SET failed_logins = 0, locked_until = 0, last_login_at = ? WHERE id = ?")
    .bind(loggedAt, user.id).run();
  const cookie = await createSession(request, env, user.id);
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}
