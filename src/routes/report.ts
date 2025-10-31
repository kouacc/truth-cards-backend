import { Hono } from "hono";
import { auth } from "../../utils/auth";
import { db } from "../../db/drizzle";
import { reports } from "../../db/schemas/schema";

const report = new Hono<{
    Variables: {
        user: typeof auth.$Infer.Session.user | null;
        session: typeof auth.$Infer.Session.session | null
    }
}>();

report.use("*", async (c, next) => {
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

report.post('/send', async (c) => {
    const user = c.get("user")
    if(!user) return c.body(null, 401);

    const { reportedUserId, reason, details } = await c.req.json<{ reportedUserId: string, reason: string, details: string }>();

    const data = await db.insert(reports).values({
        userReported: reportedUserId,
        userReporting: user.id,
        reason,
        details,
    }).returning();

    return c.json(data);
})




export { report };