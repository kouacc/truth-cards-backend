import { sql, inArray } from "drizzle-orm";
import { db } from "../db/drizzle";
import { question } from "../db/schemas/schema";
import { client as redis } from "./redis";


/* async function getQuestions(content?: { categories?: string[], amount?: number}) {
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
} */


async function getQuestions(content?: { amount?: number, sets?: string[]}) {
    const amount = content?.amount || 10;
    const sets = content?.sets || [];

    const questionsFromSets = sets.length > 0 ? Math.floor(amount / 2) : 0;
    const questionsFromAll = amount - questionsFromSets;

    let allQuestions: { id: string; question: string; answer: string | null }[] = []

    if (questionsFromAll > 0) {
        const generalQuestions = await db.query.question.findMany({
            limit: questionsFromAll,
            orderBy: sql`RANDOM()`,
            where: sets.length > 0 ? sql`${question.setId} IS NULL OR ${question.setId} NOT IN ${sets}` : undefined,
            columns: {
                id: true,
                question: true,
                answer: true,
            },
        });
        allQuestions = [...generalQuestions];
    }

    if (questionsFromSets > 0 && sets.length > 0) {
        const setQuestions = await db.query.question.findMany({
            limit: questionsFromSets,
            orderBy: sql`RANDOM()`,
            where: inArray(question.setId, sets),
            columns: {
                id: true,
                question: true,
                answer: true,
            },
        });
        allQuestions = [...allQuestions, ...setQuestions];
    }

    allQuestions.sort(() => Math.random() - 0.5);

    return allQuestions;
}

export async function goToNextQuestion(gameId: string, index: string) {
    if (await !redis.exists(`game:${gameId}:currentQuestionIndex`)) {
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