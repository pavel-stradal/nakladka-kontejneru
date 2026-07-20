import { getSessionUser, isSameOrigin, json, nowIso, readJson } from "../../_lib/auth.js";

function parseJob(row) {
  let data = {};
  try {
    data = JSON.parse(row.data);
  } catch {
    data = {};
  }
  return {
    id: row.id,
    name: row.name,
    data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validJobName(value) {
  const name = String(value || "").trim();
  return name.length >= 1 && name.length <= 80 ? name : "";
}

function validJobData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const serialized = JSON.stringify(data);
  if (serialized.length > 750000) return null;
  return serialized;
}

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Nejdříve se přihlaste." }, 401);
  const result = await env.DB.prepare(`
    SELECT id, name, data, created_at, updated_at
    FROM loading_jobs
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT 100
  `).bind(user.id).all();
  return json({ jobs: result.results.map(parseJob) });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: "Neplatný původ požadavku." }, 403);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Nejdříve se přihlaste." }, 401);

  const body = await readJson(request);
  const name = validJobName(body?.name);
  const data = validJobData(body?.data);
  if (!name) return json({ error: "Zadejte název zakázky." }, 400);
  if (!data) return json({ error: "Data zakázky nejde uložit." }, 400);

  const now = nowIso();
  const id = typeof body?.id === "string" && body.id ? body.id : crypto.randomUUID();
  const existing = await env.DB.prepare("SELECT id FROM loading_jobs WHERE id = ? AND user_id = ?").bind(id, user.id).first();
  if (existing) {
    await env.DB.prepare("UPDATE loading_jobs SET name = ?, data = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(name, data, now, id, user.id).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO loading_jobs (id, user_id, name, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, user.id, name, data, now, now).run();
  }

  const row = await env.DB.prepare(`
    SELECT id, name, data, created_at, updated_at
    FROM loading_jobs
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first();
  return json({ job: parseJob(row) });
}
