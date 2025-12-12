import { Hono } from "hono";
import { auth } from "../../utils/auth";
import { db } from "../../db/drizzle";

const history = new Hono<{
    Variables: {
        user: typeof auth.$Infer.Session.user | null;
        session: typeof auth.$Infer.Session.session | null
    }
}>();;

history.use("*", async (c, next) => {
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


export { history };