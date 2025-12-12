import { goToNextQuestion } from "./questions";
import { client as redis } from "./redis";
import { io } from "../src";

export async function startGameQuestionLoop(gameCode: string, questionCount: number, intervalInSeconds: number) {
    console.log(`Started game loop for game ${gameCode} with ${questionCount} questions, ${intervalInSeconds}s interval`);
    
    const intervalMs = intervalInSeconds * 1000;
    let questionIndex = 0;
    
    // Premier appel immédiat
    (async () => {
        try {
            const question = await goToNextQuestion(gameCode, questionIndex.toString());
            
            if (question) {
                io.to(gameCode).emit("nextQuestion", question);
                console.log(`Emitted question ${questionIndex + 1} to game ${gameCode}`);
                console.log(question);
                questionIndex++;
            }
        } catch (error) {
            console.error(`Error in initial question for ${gameCode}:`, error);
        }
    })();
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const intervalId = setInterval(async () => {
        try {
            const question = await goToNextQuestion(gameCode, questionIndex.toString());
            
            if (question) {
                io.to(gameCode).emit("nextQuestion", question);
                console.log(`Emitted question ${questionIndex + 1} to game ${gameCode}`);
                console.log(question);
                questionIndex++;
                
                // Si on a envoyé toutes les questions, arrêter la boucle et démarrer la validation
                if (questionIndex >= questionCount) {
                    clearInterval(intervalId);
                    console.log(`Game loop for game ${gameCode} completed`);
                    io.to(gameCode).emit("gameStatus", { status: "answers" });
                    
                    // Démarrer la boucle de validation des réponses
                    await startAnswersValidationLoop(gameCode, intervalInSeconds);
                }
            } else {
                console.log(`No more questions available for game ${gameCode}`);
                clearInterval(intervalId);
                io.to(gameCode).emit("gameStatus", { status: "answers" });
                
                // Démarrer la boucle de validation des réponses
                await startAnswersValidationLoop(gameCode, intervalInSeconds);
            }
        } catch (error) {
            console.error(`Error in game loop for ${gameCode}:`, error);
            clearInterval(intervalId);
            io.to(gameCode).emit("error", { message: "Game loop error" });
        }
    }, intervalMs);
    
    // Retourner une fonction pour pouvoir arrêter la boucle si nécessaire
    return () => clearInterval(intervalId);
}

export async function startAnswersValidationLoop(gameCode: string, intervalInSeconds: number = 15) {
    console.log(`Started answers validation loop for game ${gameCode} with ${intervalInSeconds}s interval`);

    const intervalMs = intervalInSeconds * 1000;
    const questionsCount = await redis.llen(`game:${gameCode}:questions`);
    const startingIndex = questionsCount > 0 ? 1 : 0;
    await redis.set(`game:${gameCode}:currentQuestionIndex`, `${startingIndex}`);

    const intervalId = setInterval(async () => {
        try {
            let currentQuestionIndex = await redis.get(`game:${gameCode}:currentQuestionIndex`);

            if (!currentQuestionIndex) {
                currentQuestionIndex = "0";
                await redis.set(`game:${gameCode}:currentQuestionIndex`, "0");
            }

            let questionIndex = parseInt(currentQuestionIndex, 10);

            if (Number.isNaN(questionIndex)) {
                questionIndex = startingIndex;
                await redis.set(`game:${gameCode}:currentQuestionIndex`, `${startingIndex}`);
            }

            if (questionsCount === 0 || questionIndex > questionsCount) {
                console.log(`No more questions to validate for game ${gameCode}`);
                clearInterval(intervalId);
                io.to(gameCode).emit("gameStatus", { status: "ended" });
                return;
            }

            const answersKey = `game:${gameCode}:answers:q${questionIndex}:answers`;
            const answersRaw = await redis.send("LRANGE", [answersKey, "0", "-1"]) as string[];

            if (!answersRaw || answersRaw.length === 0) {
                console.log(`No answers found for question ${questionIndex} in game ${gameCode}`);
                await redis.incr(`game:${gameCode}:currentQuestionIndex`);

                if (questionIndex >= questionsCount) {
                    clearInterval(intervalId);
                    io.to(gameCode).emit("gameStatus", { status: "ended" });
                }

                return;
            }

            const answers = answersRaw.map((entry) => JSON.parse(entry)) as { userId: string; answer: string }[];

            // Récupérer la question depuis Redis
            const questionKey = `game:${gameCode}:questions`;
            const questionRaw = await redis.lindex(questionKey, questionIndex - 1) as string | null;
            
            let question = null;
            let correctAnswer = null;
            
            if (questionRaw) {
                const questionData = JSON.parse(questionRaw);
                question = questionData.question;
                correctAnswer = questionData.answer;
            }

            io.to(gameCode).emit("nextAnswer", {
                questionIndex,
                question,
                correctAnswer,
                answers,
            });

            await redis.incr(`game:${gameCode}:currentQuestionIndex`);

            if (questionIndex >= questionsCount) {
                clearInterval(intervalId);
                io.to(gameCode).emit("gameStatus", { status: "ended" });
            }
        } catch (error) {
            console.error(`Error in answers validation loop for ${gameCode}:`, error);
            clearInterval(intervalId);
            io.to(gameCode).emit("error", { message: "Answers validation loop error" });
        }
    }, intervalMs);

    // Retourner une fonction pour pouvoir arrêter la boucle si nécessaire
    return () => clearInterval(intervalId);
}