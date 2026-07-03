import { json, publicUser, requireAdmin } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "Přístup je povolen pouze administrátorovi." }, 403);
  const result = await env.DB.prepare(`
    SELECT id, email, name, role, status, created_at, approved_at, last_login_at
    FROM users ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
  `).all();
  return json({ users: result.results.map(publicUser), currentUserId: admin.id });
}
