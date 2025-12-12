import { Server } from "socket.io";
import { Server as Engine } from "@socket.io/bun-engine";
import { convertObjectToHMSet, client as redis } from '../utils/redis';
import { auth } from '../utils/auth';
import { instrument } from '@socket.io/admin-ui';
import '../types/socket';
import { GameSettings } from "./routes/games";
import type { AnswerEvent, JoinEvent } from "../types/socket";

export const io = new Server({
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: false
  }
});
export const engine = new Engine();
io.bind(engine);

io.on("connection", (socket) => {
  const userId = socket.user?.id || `guest_${crypto.randomUUID()}` 


  socket.on("join", async (data: JoinEvent, callback) => {
    const { code } = data;

    const gameExists = await redis.exists(`game:${code}:settings`);
    if (!gameExists) {
      socket.emit("error", { msg: "Game not found" });
      return;
    }

    socket.join(code);

    // Mettre l'utilisateur dans la liste des joueurs
    await redis.sadd(`game:${code}:players`, socket.user ? JSON.stringify({ id: socket.user.id, name: socket.user.username, image: socket.user.image ?? null }) : JSON.stringify({ id: userId, name: `Guest ${userId.split('_')[1].substring(0, 8)}` }));

    const gameSettings = await redis.hgetall(`game:${code}:settings`);
    gameSettings.host = gameSettings.host ? JSON.parse(gameSettings.host) : null;

    const playersData = await redis.smembers(`game:${code}:players`);
    const players = playersData.map(playerStr => JSON.parse(playerStr));

    callback({ success: true, gameSettings, players });
    io.to(code).emit("players", { players });
  }); 

  socket.on("leave", async () => {
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    if (rooms.length === 0) {
      socket.emit("error", { msg: "You are not in a game" });
      return;
    }

    const gameId = rooms[0];

    await redis.srem(`game:${gameId}:players`, socket.user ? JSON.stringify({ id: socket.user.id, name: socket.user.username }) : JSON.stringify({ id: userId, name: `Guest ${userId.split('_')[1].substring(0, 8)}` }));
    socket.leave(gameId);

    const playersData = await redis.smembers(`game:${gameId}:players`);
    const players = playersData.map(playerStr => JSON.parse(playerStr));
    io.to(gameId).emit("players", { players });

    // verifier le nombre de joueurs connectés à la room
    const room = io.sockets.adapter.rooms.get(gameId);
    if (!room || room.size === 0) {
      // TODO: ajouter ttl si la partie n'a pas été commencée et que plus personne n'est connecté
    }
  })


  socket.on("sendAnswer", async (data: AnswerEvent, callback) => {
    const answer = data;
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    if (rooms.length === 0) {
      socket.emit("error", { msg: "You are not in a game" });
      return;
    }

    const gameId = rooms[0];
    const currentQuestionIndex = await redis.get(`game:${gameId}:currentQuestionIndex`) || "0";
    
    const answerData = JSON.stringify({ userId, answer, timestamp: Date.now() });
    await redis.lpush(`game:${gameId}:answers:q${currentQuestionIndex}:answers`, answerData);

    // emit vers la room
    socket.to(gameId).emit("playerHasAnswered", { [socket.user?.id ?? userId]: true})
    callback({ success: true, answer: answerData });
  })



  socket.on("answerVote", async (data) => {
    const { score, answerId, questionIndex } = data;
    
    // Validation du score (doit être entre 1 et 3)
    if (!score || ![1, 2, 3].includes(score)) {
      socket.emit("error", { msg: "Score invalide. Le score doit être 1, 2 ou 3" });
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

    io.to(gameId).emit("gameSettings", { settings });
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
