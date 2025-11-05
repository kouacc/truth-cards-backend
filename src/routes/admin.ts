import { Hono } from "hono";
import { auth } from "../../utils/auth";
import { db } from "../../db/drizzle";
import { category, Category, question, type Question, reports, sets } from "../../db/schemas/schema";
import { eq, sql } from "drizzle-orm";
import { deleteProfilePicture, S3, uploadProfilePicture } from "../../utils/bucket";
import { createID } from "../../utils";
import { io } from "..";
import { getStats } from "../../utils/stats";

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

    if (session.user.role !== 'admin') {
        return c.body(null, 403);
    }

  	return next();
});

admin.get('/categories', async (c) => {
    const base = await db.query.category.findMany({
        columns: {
            id: true,
            title: true,
            description: true,
            assets: true,
        },
        extras: {
            questionsCount: sql<number>`(select count(*) from question where question.category = category.id)`.as('questionsCount')
        }
    })

    const assets = await S3.list({
        prefix: 'categories/'
    })

    const assetList = assets.contents?.filter(asset => asset.size! > 0)

    const sets = base.map(set => {
        const banner = assetList?.find(asset => asset.key!.includes(`${set.id}/banner/`));
        return {
            ...set,
            assets: banner?.key ? process.env.BUCKET_PUBLIC_URL! + '/' + banner.key : null
        }
    })

    return c.json(sets);
})

admin.post('/categories/create', async (c) => {
    const { title, description } = await c.req.json<Category>();

    const id = createID();

    const cat = await db.insert(category).values({
        id,
        title,
        description,
        assets: "categories/" + id
    })
    .returning()
    .onConflictDoNothing();

    return c.json(cat);
})

admin.get('/categories/:id', async (c) => {
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
    
    const contentList = assetsList.contents?.filter(asset => asset.size! > 0)

    const assets = {
        card: contentList?.find(asset => asset.key!.includes('card/'))?.key 
            ? process.env.BUCKET_PUBLIC_URL! + '/' + contentList.find(asset => asset.key!.includes('card/'))?.key 
            : null,
        banner: contentList?.find(asset => asset.key!.includes('banner/'))?.key 
            ? process.env.BUCKET_PUBLIC_URL! + '/' + contentList.find(asset => asset.key!.includes('banner/'))?.key 
            : null,
    }



    return c.json({ category: cat, assets });
})

admin.patch('/categories/:id', async (c) => {
    const { id } = c.req.param();

    const { title, description } = await c.req.json<Category>();

    const cat = await db.update(category).set({
        title,
        description
    })
    .where(eq(category.id, id))
    .returning();

    return c.json(cat[0]);
});

admin.patch('/categories/:id/assets', async (c) => {
    const formData = await c.req.formData();
    const editedAsset = formData.get('editedAsset') as string;
    const asset = formData.get('asset') as File;
    const oldAsset = formData.get('oldAsset') as string;

    const { id } = c.req.param();

    if(!asset) return c.body(null, 400);

    if (oldAsset) {
        await S3.delete('categories/' + id + '/' + editedAsset + '/' + oldAsset);
    }

    const assetKey = `categories/${id}/${editedAsset}/` + asset.name;

    await S3.write(assetKey, asset)


    return c.json({ url: process.env.BUCKET_PUBLIC_URL! + '/' + assetKey });
})


admin.delete('/categories/:id', async (c) => {
    const { id } = c.req.param();

    await db.delete(category).where(eq(category.id, id));

    await S3.delete('categories/' + id + '/');

    return c.json({ success: true });
})

admin.post('/questions/create', async (c) => {
    const { question: ques, answer, category } = await c.req.json<Question>();

    const q = await db.insert(question).values({
        question: ques,
        answer,
        category
    }).returning().onConflictDoNothing();

    return c.json(q[0]);
})

admin.patch('/questions/:id', async (c) => {
    const { id } = c.req.param();

    const { question: ques, answer, category } = await c.req.json<Question>();

    const q = await db.update(question).set({
        question: ques,
        answer: answer,
        category: category
    })
    .where(eq(question.id, id))
    .returning();

    return c.json(q[0]);
});

admin.delete('/questions/:id', async (c) => {
    const { id } = c.req.param();

    await db.delete(question).where(eq(question.id, id));

    return c.json({ success: true });
})

admin.get('/sets/:userId', async (c) => {
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
    const { id } = c.req.param();
    await db.delete(sets).where(eq(sets.id, id));

    return c.json({ success: true });
})

admin.get('/reports', async (c) => {
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
                    image: true
                },
            },
            userReporting: {
                columns: {
                    id: true,
                    name: true,
                    displayUsername: true,
                    email: true,
                    emailVerified: true,
                    image: true
                },
            },
        }
    })

    return c.json(report);
})

admin.delete('/reports/:id', async (c) => {
    const { id } = c.req.param();

    await db.delete(reports).where(eq(reports.id, id));

    return c.json({ success: true });
})

admin.post('/:userId/profilepic', async (c) => {
    const { userId } = c.req.param();

    const queryUser = await auth.api.getUser({
        headers: c.req.raw.headers,
        query: {
            id: userId
        }
    })

    if (!queryUser) return c.body(null, 404);

    if (queryUser.image) {
        const filename = queryUser.image.split('/').pop();
        await deleteProfilePicture(queryUser.id, filename!);
    }

    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    if(!file) return c.body(null, 400);

    const profilePictureUrl = await uploadProfilePicture(userId, file);

    return c.json({ profilePictureUrl });
})

admin.get('/legal/diff', async (c) => {
    const cgu = Bun.file('./assets/cgu.md');
    const mentions = Bun.file('./assets/mentions.md');
    const privacy = Bun.file('./assets/privacy.md');

    return c.json({
        cgu: cgu.lastModified,
        mentions: mentions.lastModified,
        privacy: privacy.lastModified,
    })
})

admin.put('/legal/:type', async (c) => {
    const { type } = c.req.param() as { type: 'cgu' | 'mentions' | 'privacy' };

    if(!['cgu', 'mentions', 'privacy'].includes(type)) {
        return c.json({ error: 'Invalid type' }, 400);
    }

    const content = await c.req.text();
    await Bun.write(`./assets/${type}.md`, content);

    return c.json({ success: true });
})

admin.get('/dashboard', async (c) => {
    const { categoriesCount, usersCount, questionsCount, setsCount } = await getStats();

    const rooms = Array.from(io.sockets.adapter.rooms.keys()).filter(roomId => roomId.length === 6);
    console.log(rooms);

    return c.json({
        rooms: rooms.length,
        connections: io.sockets.sockets.size,
        categories: categoriesCount,
        questions: questionsCount,
        usersSets: setsCount,
        users: usersCount,
    })
})

export { admin };