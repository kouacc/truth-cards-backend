import { Server } from "socket.io";
import { Server as Engine } from "@socket.io/bun-engine";
import { convertObjectToHMSet, client as redis } from '../utils/redis';
import { auth } from '../utils/auth';
import { instrument } from '@socket.io/admin-ui';
import '../types/socket';
import { GameSettings } from "./routes/games";

export const io = new Server();
export const engine = new Engine();
io.bind(engine);

io.on("connection", (socket) => {
  const userId = `guest_${crypto.randomUUID()}`;

  socket.on("join", async (data) => {
    const { code } = data;  // gameId

    const gameExists = await redis.exists(`game:${code}:settings`);
    if (!gameExists) {
      socket.emit("error", { msg: "Game not found" });
      return;
    }

    socket.join(code);

    // Mettre l'utilisateur dans la liste des joueurs
    await redis.sadd(`game:${code}:players`, socket.user ? JSON.stringify({ id: socket.user.id, name: socket.user.username }) : JSON.stringify({ id: userId, name: `Guest ${userId.split('_')[1].substring(0, 8)}` }));

    const gameSettings = await redis.hgetall(`game:${code}:settings`);

    socket.emit("joined", { game: code });
    socket.emit('sessionInfo', gameSettings);

    const playersData = await redis.smembers(`game:${code}:players`);
    const players = playersData.map(playerStr => JSON.parse(playerStr));
    io.to(code).emit("players", { players });

  }); 

  socket.on("sendAnswer", async (data) => {
    const { answer } = data;
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    if (rooms.length === 0) {
      socket.emit("error", { msg: "You are not in a game" });
      return;
    }

    const gameId = rooms[0];
    const currentQuestionIndex = await redis.get(`game:${gameId}:currentQuestionIndex`) || "0";
    
    const answerData = JSON.stringify({ userId, answer, timestamp: Date.now() });
    await redis.lpush(`game:${gameId}:answers:q${currentQuestionIndex}:answers`, answerData);

    socket.emit("answerReceived", { answer });
  })

  socket.on("answerVote", async (data) => {
    const { score, answerId, questionIndex } = data;
    
    // Validation du score (doit être entre 1 et 3)
    if (!score || ![1, 2, 3].includes(score)) {
      socket.emit("error", { msg: "Invalid score. Score must be 1, 2, or 3" });
      return;
    }

    // Vérifier que l'utilisateur est dans une partie
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    if (rooms.length === 0) {
      socket.emit("error", { msg: "You are not in a game" });
      return;
    }

    const gameId = rooms[0];

    // Validation des paramètres requis
    if (!answerId || questionIndex === undefined) {
      socket.emit("error", { msg: "Missing answerId or questionIndex" });
      return;
    }

    try {
      // Stocker le score dans Redis
      // Structure: game:${gameId}:scores:q${questionIndex}:${answerId} -> score
      const scoreKey = `game:${gameId}:scores:q${questionIndex}:${answerId}`;
      await redis.lpush(scoreKey, score.toString());

      // Optionnel: Compter le nombre total de votes pour cette réponse
      const voteCount = await redis.llen(scoreKey);

      socket.emit("voteReceived", { 
        answerId, 
        questionIndex, 
        score,
        voteCount 
      });

      console.log(`Vote received for game ${gameId}, question ${questionIndex}, answer ${answerId}: score ${score}`);
    } catch (error) {
      console.error("Error storing vote:", error);
      socket.emit("error", { msg: "Failed to store vote" });
    }
  })

  socket.on("updateSettings", async (data) => {
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    if (rooms.length === 0) {
      socket.emit("error", { msg: "You are not in a game" });
      return;
    }

    const gameId = rooms[0];

    const settings: Partial<GameSettings> = data;

    const host = await redis.hget(`game:${gameId}:settings`, "host");
    const user = socket.user;
    if (host !== user?.id) {
      socket.emit("error", { msg: "You are not the host" });
    } 

    settings.host = host ?? undefined;

    //update les settings dans redis
    const hset = convertObjectToHMSet(settings);
    redis.hmset(`game:${gameId}:settings`, hset);
  })
});

io.use(async (socket, next) => {
  const headers = socket.handshake.headers;

  const session = await auth.api.getSession({ 
    headers: headers as unknown as Headers 
  })

  if (session) {
    socket.user = session.user;
    return next();
  }
  return next();
})

instrument(io, {
  auth: false
});

export const { websocket } = engine.handler();
