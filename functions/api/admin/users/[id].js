import { isSameOrigin, json, nowIso, readJson, requireAdmin } from "../../../_lib/auth.js";

const transitions = {
  approve: "active",
  reject: "rejected",
  disable: "disabled",
  activate: "active",
};

export async function onRequestPatch({ request, env, params }) {
  if (!isSameOrigin(request)) return json({ error: "Neplatný původ požadavku." }, 403);
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Přístup je povolen pouze administrátorovi." }, 403);
  if (params.id === admin.id) return json({ error: "Vlastní administrátorský účet zde nelze změnit." }, 400);

  const body = await readJson(request);
  const status = transitions[body?.action];
  if (!status) return json({ error: "Neplatná akce." }, 400);
  const target = await env.DB.prepare("SELECT id, status FROM users WHERE id = ?").bind(params.id).first();
  if (!target) return json({ error: "Uživatel nebyl nalezen." }, 404);

  const changedAt = nowIso();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?")
      .bind(status, status === "active" ? changedAt : null, status === "active" ? admin.id : null, params.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(params.id),
    env.DB.prepare("INSERT INTO audit_log (id, actor_user_id, action, target_user_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), admin.id, `user_${body.action}`, params.id, `${target.status}->${status}`, changedAt),
  ]);
  return json({ ok: true });
}
