import { Hono } from "hono";
import { auth } from "../../utils/auth";
import { db } from "../../db/drizzle";
import { category, Category, question, Question, reports, sets } from "../../db/schemas/schema";
import { count, eq } from "drizzle-orm";
import { S3 } from "../../utils/bucket";

const admin = new Hono<{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null
	}
}>();

admin.use("*", async (c, next) => {
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

admin.get('/questions', async (c) => {
	const user = c.get("user")
	
	if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const questions = await db.query.question.findMany({})
});

admin.get('/categories', async (c) => {
    const user = c.get("user")
	
	if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const sets = await db.query.category.findMany({
        // TODO ajouter count de questions par catégories
    })

    return c.json(sets);
})

admin.post('/categories/create', async (c) => {
    const user = c.get("user")
	
	if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const { title, description, assets } = await c.req.json<Category>();

    const cat = await db.insert(category).values({
        title,
        description,
        assets
    })
    .returning()
    .onConflictDoNothing();

    return c.json(cat);
})

admin.get('/categories/:id', async (c) => {
    const user = c.get("user")
	
	if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const { id } = c.req.param();

    const cat = await db.query.category.findFirst({
        where: eq(category.id, id),
        with: {
            questions: true
        },
        extras: {
            questionsCount: db.$count(question, eq(category.id, id)).as('questionsCount')
        }
    });

    const assetsList = await S3.list({
        prefix: `categories/${id}/`
    })
    
    // TODO inclure le lien CDN dans la liste des assets

    return c.json({ category: cat, assets: assetsList });
})

admin.delete('/categories/:id', async (c) => {
    const user = c.get("user")
	
	if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const { id } = c.req.param();

    await db.delete(category).where(eq(category.id, id));

    return c.json({ success: true });
})

admin.post('/questions/create', async (c) => {
    const user = c.get("user")
	
	if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const { question: ques, category } = await c.req.json<Question>();

    await db.insert(question).values({
        question: ques,
        category
    }).returning().onConflictDoNothing();

    return c.json({ success: true });
})

admin.patch('/questions/:id', async (c) => {
    const user = c.get("user")
    
    if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const { id } = c.req.param();

    const { question: ques, category } = await c.req.json<Question>();
})

admin.delete('/questions/:id', async (c) => {
    const user = c.get("user")
	
	if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const { id } = c.req.param();

    await db.delete(question).where(eq(question.id, id));

    return c.json({ success: true });
})

admin.get('/sets/:userId', async (c) => {
    const user = c.get("user")

    if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);
    const { userId } = c.req.param();

    const data = await db.query.sets.findMany({
        where: eq(sets.created_by, userId),
        orderBy: (sets, { desc }) => [desc(sets.createdAt)],
        with: {
            questions: true 
        }
    })

    return c.json(data);
})

admin.delete('/sets/:id', async (c) => {
    const user = c.get("user")
    if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const { id } = c.req.param();
    await db.delete(sets).where(eq(sets.id, id));

    return c.json({ success: true });
})

admin.get('/reports', async (c) => {
    const user = c.get("user")

    if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const reports = await db.query.reports.findMany({
        columns: {
            id: true,
            reason: true,
            createdAt: true,
        },
        with: {
            userReported: {
                columns: {
                    id: true,
                    name: true,
                    displayUsername: true,
                }
            },
            userReporting: {
                columns: {
                    id: true,
                    name: true,
                    displayUsername: true,
                }
            },
        }
    });

    return c.json(reports);
})

admin.get('/reports/:id', async (c) => {
    const user = c.get("user")
    if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const { id } = c.req.param();
    const report = await db.query.reports.findFirst({
        where: eq(reports.id, id),
        with: {
            userReported: {
                columns: {
                    id: true,
                    name: true,
                    displayUsername: true,
                    email: true,
                    emailVerified: true,
                },
            },
            userReporting: {
                columns: {
                    id: true,
                    name: true,
                    displayUsername: true,
                    email: true,
                    emailVerified: true,
                },
            },
        }
    })

    return c.json(report);
})

admin.delete('/reports/:id', async (c) => {
    const user = c.get("user")

    if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const { id } = c.req.param();

    await db.delete(reports).where(eq(reports.id, id));

    return c.json({ success: true });
})

admin.get('/', async (c) => {
    const files = await S3.list({
        prefix: 'tc-icon Exports/'
    });
    return c.json(files);
})

admin.delete('/assets/:categoryId/delete/:assetId', async (c) => {
    const user = c.get("user")
	
	if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);
    
    const { categoryId, assetId } = c.req.param();

    await S3.file(`categories/${categoryId}/${assetId}`).delete();

    return c.json({ success: true });
})

admin.patch('/legal/:file/update', async (c) => {
    const user = c.get("user")

    if(!user) return c.body(null, 401);
    if(user.role !== 'admin') return c.body(null, 403);

    const { file } = c.req.param() as { file: 'cgu' | 'mentions' };
    const content = await c.req.text();

    await Bun.write(`./assets/${file}.md`, content);

    return c.json({ success: true });
})

export { admin };