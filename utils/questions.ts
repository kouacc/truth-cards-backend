import { sql, inArray, eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { question } from "../db/schemas/schema";
import { redis } from "bun";

async function getQuestions(content?: { categories?: string[], amount?: number}) {
    const query = db.query.question.findMany({
        limit: content?.amount || 10,
        orderBy: sql`RANDOM()`,
        where: content?.categories ? inArray(question.category, content.categories) : undefined,
        columns: {
            id: true,
            question: true,

        },
        with: { 
            category: {
                columns: {
                    id: true,
                    title: true,
                    description: true
                }
            } 
        }
    }).prepare('randomQuestions');

    return await query.execute();
}

export async function getQuestionsFromSet(setId: string) {
    const query = db.query.question.findMany({
        where: eq(question.setId, setId),
        columns: {
            id: true,
            question: true,
        },
        orderBy: sql`RANDOM()`,
    }).prepare('questionsFromSet');

    return await query.execute();
}

export async function goToNextQuestion(gameId: string, index: string) {
    if (await !redis.exists(`game:${gameId}:settings`)) {
        throw new Error('Game not found');
    }

    const question = await redis.send('LINDEX', [`game:${gameId}:questions`, index])

    if (!question) {
        return null;
    }

    await redis.incr(`game:${gameId}:currentQuestionIndex`);
    return JSON.parse(question);
}


export { getQuestions };