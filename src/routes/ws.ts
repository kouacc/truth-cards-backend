import { Hono } from "hono"
import { upgradeWebSocket } from "hono/bun"
import { auth } from "../../utils/auth";
import { redis } from "bun";
import { io } from "..";

const ws = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null
  }
}>();

ws.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      c.set("user", null);
      c.set("session", null);
      return next();
    }
    c.set("user", session.user);
    c.set("session", session.session);
    return next();
});

ws.get('/session/:id', async (c) => {
  const { id } = c.req.param()

  io.to(id).emit('hello', `Hello from session ${id}`)
  return c.json({ message: `Message sent to session ${id}` });
})



export { ws };