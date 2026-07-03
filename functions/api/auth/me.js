import { getSessionUser, json, publicUser } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  return json(user ? { authenticated: true, user: publicUser(user) } : { authenticated: false });
}
