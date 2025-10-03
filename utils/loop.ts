import { goToNextQuestion } from "./questions";
import { io } from "../src";

export async function startGameQuestionLoop(gameCode: string, questionCount: number, intervalInSeconds: number) {
    console.log(`Started game loop for game ${gameCode} with ${questionCount} questions, ${intervalInSeconds}s interval`);
    
    const intervalMs = intervalInSeconds * 1000;
    let questionIndex = 0;
    
    const intervalId = setInterval(async () => {
        try {
            const question = await goToNextQuestion(gameCode, questionIndex.toString());
            
            if (question) {
                io.to(gameCode).emit("nextQuestion", question);
                console.log(`Emitted question ${questionIndex + 1} to game ${gameCode}`);
                questionIndex++;
                
                // Si on a envoyé toutes les questions, arrêter la boucle
                if (questionIndex >= questionCount) {
                    clearInterval(intervalId);
                    console.log(`Game loop for game ${gameCode} completed`);
                    io.to(gameCode).emit("gameStatus", { status: "ended" });
                }
            } else {
                console.log(`No more questions available for game ${gameCode}`);
                clearInterval(intervalId);
                io.to(gameCode).emit("gameStatus", { status: "ended" });
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