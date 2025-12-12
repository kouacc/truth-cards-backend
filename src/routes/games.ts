import { Hono } from "hono";
import { auth } from "../../utils/auth";
import { redis } from "bun";
import { createGameCode, createGameToken } from "../../utils/id";
import { getQuestions } from "../../utils/questions";
import { convertObjectToHMSet } from "../../utils/redis";
import { io } from "..";
import { startGameQuestionLoop } from "../../utils/loop";

const games = new Hono<{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null
	}
}>();

export interface GameSettings {
    host: string;
    sets: string[];
    amountOfQuestions?: number;
    timePerQuestion?: number;
    owner?: string
}

games.use("*", async (c, next) => {
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

games.post('/init', async (c) => {
    const user = c.get("user");
 
    const gameCode = createGameCode();
    const gameToken = createGameToken();

    const gameInfo: GameSettings = {
        host: JSON.stringify({ id: user?.id || "anonymous", username: user?.displayUsername || "Anonymous"}),
        sets: [],
        amountOfQuestions: 10,
        timePerQuestion: 30,
    }

    
    await redis.hmset(`game:${gameCode}:settings`, convertObjectToHMSet(gameInfo));
    await redis.set(`game:${gameCode}:currentQuestionIndex`, "0");
    
    /* const questions = await getQuestions({ amount: gameInfo.amountOfQuestions });
    //push les questions dans une liste redis
    const serializedQuestions = questions.map(q => JSON.stringify(q));
    await redis.rpush(`game:${gameCode}:questions`, ...serializedQuestions as [string, ...string[]]); */

    return c.json({ gameCode, gameToken });
})

games.delete('/:gameCode', async (c) => {
    //const user = c.get("user");
    const { gameCode } = c.req.param();

    await redis.del(`game:${gameCode}`);

    return c.json({ message: `Game ${gameCode} deleted` });
})

games.post('/:gameCode/start', async (c) => {
    // TODO vérfier que l'utilisateur est bien l'hôte
    //const user = c.get("user");
    const { gameCode } = c.req.param();

    io.to(gameCode).emit("gameStatus", { status: "started" });

    const [amountOfQuestions, timePerQuestion, sets] = await redis.hmget(`game:${gameCode}:settings`, ["amountOfQuestions", "timePerQuestion", "sets"]);
    if (!amountOfQuestions || !timePerQuestion) {
        return c.json({ error: "Game settings not found" }, 404);
    }

    const gameSettings = { amountOfQuestions: parseInt(amountOfQuestions), timePerQuestion: parseInt(timePerQuestion), sets: sets ? JSON.parse(sets) : [] };

    // TODO fetch les questions et ajouter dans redis
    const questions = await getQuestions({ amount: parseInt(amountOfQuestions), sets: gameSettings.sets });
    const serializedQuestions = questions.map(q => JSON.stringify(q));
    await redis.rpush(`game:${gameCode}:questions`, ...serializedQuestions as [string, ...string[]]);

    await startGameQuestionLoop(gameCode, gameSettings.amountOfQuestions, gameSettings.timePerQuestion);

    return c.json({ message: `Game ${gameCode} started` });
})

export { games };