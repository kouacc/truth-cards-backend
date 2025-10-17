import { Hono } from "hono";
import { auth } from "../../utils/auth";
import { db } from "../../db/drizzle";
import { eq } from "drizzle-orm";
import { question, sets } from "../../db/schemas/schema";
import badwords from 'french-badwords-list';

const userSets = new Hono<{
    Variables: {
        user: typeof auth.$Infer.Session.user | null;
        session: typeof auth.$Infer.Session.session | null
    }
}>();

userSets.use("*", async (c, next) => {
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

userSets.get("/list", async (c) => {
    const user = c.get("user")

    if(!user) return c.body(null, 401);

    const data = await db.query.sets.findMany({
        where: eq(sets.created_by, user.id),
        orderBy: (sets, { desc }) => [desc(sets.updatedAt)],
    })

    return c.json(data);
});

userSets.post("/create", async (c) => {
    const user = c.get("user")
    if(!user) return c.body(null, 401);

    const { title } = await c.req.json<{ title: string }>();

    const set = await db.insert(sets).values({
        title,
        created_by: user.id
    })
    .returning();

    return c.json(set);
});

userSets.delete('/:setId', async (c) => {
    const user = c.get("user")
    if(!user) return c.body(null, 401);

    const { setId } = c.req.param();

    const set = await db.delete(sets).where(eq(sets.id, setId)).returning();
    if (!set) return c.body(null, 404);

    return c.json(set);
})

userSets.post('/add-question', async (c) => {
    const user = c.get("user")
    if(!user) return c.body(null, 401);

    const { question: questionString, answer, setId } = await c.req.json<{ question: string, answer?: string, setId: string, }>();

    if (badwords.regex.test(questionString)) {
        return c.body(null, 400);
    }

    if (badwords.regex.test(answer || '')) {
        return c.body(null, 400);
    }

    const data = await db.insert(question).values({
        question: questionString,
        answer: answer || null,
        setId
    }).returning();

    return c.json(data);
})

userSets.delete('/question/:questionId', async (c) => {
    const user = c.get("user")
    if(!user) return c.body(null, 401);

    const { questionId } = c.req.param();

    const data = await db.delete(question).where(eq(question.id, questionId)).returning();
    if (!data) return c.body(null, 404);

    return c.json(data);
})



export { userSets };