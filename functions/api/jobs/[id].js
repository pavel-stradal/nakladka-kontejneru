import { getSessionUser, isSameOrigin, json } from "../../_lib/auth.js";

export async function onRequestDelete({ request, env, params }) {
  if (!isSameOrigin(request)) return json({ error: "Neplatný původ požadavku." }, 403);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Nejdříve se přihlaste." }, 401);
  const result = await env.DB.prepare("DELETE FROM loading_jobs WHERE id = ? AND user_id = ?")
    .bind(params.id, user.id).run();
  if (!result.meta.changes) return json({ error: "Zakázka nebyla nalezena." }, 404);
  return json({ ok: true });
}
