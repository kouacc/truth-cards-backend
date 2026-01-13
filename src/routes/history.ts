import { Hono } from "hono";
import { auth } from "../../utils/auth";
import { db } from "../../db/drizzle";
import { arrayContains } from "drizzle-orm";
import { games as gamesSchema } from "../../db/schemas/schema";

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

      return c.body(null, 401);
    }
    c.set("user", session.user);
    c.set("session", session.session);

    return next();
});

history.get('/', async (c) => {
    const user = c.get("user");

    const g = await db.select().from(gamesSchema).where(
      arrayContains(gamesSchema.players, user!.id)
    )
})

history.get('/:gameId', async (c) => {
    const user = c.get("user");
    const { gameId } = c.req.param();


})


export { history };