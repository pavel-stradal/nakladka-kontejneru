import { clearSession, isSameOrigin, json } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: "Neplatný původ požadavku." }, 403);
  return json({ ok: true }, 200, { "Set-Cookie": await clearSession(request, env) });
}
