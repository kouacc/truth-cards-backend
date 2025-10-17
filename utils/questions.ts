import { sql, inArray, eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { question } from "../db/schemas/schema";
import { client as redis } from "./redis";

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

async function getQuestionsFromSet(setId: string) {
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

async function goToNextAnswerValidation(gameId: string) {
    // Vérifier si la partie existe
    if (!await redis.exists(`game:${gameId}:currentQuestionIndex`)) {
        throw new Error('Game not found');
    }

    const questionsCount = await redis.llen(`game:${gameId}:questions`);
    let currentQuestionIndex = await redis.get(`game:${gameId}:currentQuestionIndex`);
    
    if (!currentQuestionIndex) {
        currentQuestionIndex = "0";
        await redis.set(`game:${gameId}:currentQuestionIndex`, '0');
    }

    const currentIndex = parseInt(currentQuestionIndex);

    // Reset question index to 0 if all questions have been answered
    if (currentIndex >= questionsCount) {
        await redis.set(`game:${gameId}:currentQuestionIndex`, '0');
        currentQuestionIndex = "0";
    }

    const answerListKey = `game:${gameId}:answers:q${currentQuestionIndex}`;
    const answerIndexKey = `game:${gameId}:answers:q${currentQuestionIndex}:index`;

    // Récupérer toutes les réponses pour la question actuelle
    const allAnswers = await redis.send('LRANGE', [answerListKey, "0", "-1"]) as string[];
    
    if (!allAnswers || allAnswers.length === 0) {
        return null; // Pas de réponses pour cette question
    }

    // Récupérer l'index de la prochaine réponse à renvoyer
    let currentAnswerIndex = await redis.get(answerIndexKey);
    if (!currentAnswerIndex) {
        currentAnswerIndex = "0";
        await redis.set(answerIndexKey, '0');
    }

    const answerIndex = parseInt(currentAnswerIndex);

    // Si on a déjà renvoyé toutes les réponses de cette question, passer à la question suivante
    if (answerIndex >= allAnswers.length) {
        // Incrémenter l'index de question
        await redis.incr(`game:${gameId}:currentQuestionIndex`);
        // Reset l'index des réponses pour la prochaine question
        const nextQuestionIndex = currentIndex + 1;
        await redis.set(`game:${gameId}:answers:q${nextQuestionIndex}:index`, '0');
        
        // Rappeler récursivement pour la question suivante
        return await goToNextAnswerValidation(gameId);
    }

    // Récupérer la réponse actuelle
    const currentAnswer = allAnswers[answerIndex];
    
    // Incrémenter l'index des réponses pour la prochaine fois
    await redis.incr(answerIndexKey);

    return {
        answer: JSON.parse(currentAnswer),
        questionIndex: currentQuestionIndex,
        answerIndex: answerIndex,
        totalAnswersForQuestion: allAnswers.length
    };
}

export { getQuestions, getQuestionsFromSet, goToNextAnswerValidation };