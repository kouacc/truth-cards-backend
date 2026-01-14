import { client as redis } from "./redis";

/**
 * Calcule les scores de tous les joueurs pour une partie donnée
 * Système de points : good = 100, neutral = 50, bad = 0
 * @param gameId - L'identifiant de la partie
 * @returns Un objet avec les userId comme clés et les scores comme valeurs
 */
export async function calculateScore(gameId: string): Promise<Record<string, number>> {
    const scores: Record<string, number> = {};

    // Récupérer le nombre total de questions
    const questionsCount = await redis.llen(`game:${gameId}:questions`);

    if (questionsCount === 0) {
        return scores;
    }

    // Pour chaque question, récupérer les réponses et calculer les scores
    for (let questionIndex = 0; questionIndex < questionsCount; questionIndex++) {
        // Récupérer toutes les réponses des joueurs pour cette question
        const answersKey = `game:${gameId}:answers:q${questionIndex}:answers`;
        const answersRaw = await redis.send("LRANGE", [answersKey, "0", "-1"]) as string[];

        if (!answersRaw || answersRaw.length === 0) {
            continue;
        }

        const answers = answersRaw.map((entry) => JSON.parse(entry)) as { userId: string; answer: string }[];

        // Pour chaque réponse, récupérer les votes et calculer le score
        for (const answer of answers) {
            const { userId } = answer;

            // Initialiser le score du joueur s'il n'existe pas encore
            if (!(userId in scores)) {
                scores[userId] = 0;
            }

            // Récupérer tous les votes pour cette réponse
            const votesKey = `game:${gameId}:scores:q${questionIndex}:${userId}`;
            const votesRaw = await redis.send("LRANGE", [votesKey, "0", "-1"]) as string[];

            if (!votesRaw || votesRaw.length === 0) {
                continue;
            }

            // Calculer le score total pour cette réponse
            for (const vote of votesRaw) {
                if (vote === "good") {
                    scores[userId] += 100;
                } else if (vote === "neutral") {
                    scores[userId] += 50;
                }
                // bad = 0 points, donc pas besoin d'ajouter
            }
        }
    }

    return scores;
}