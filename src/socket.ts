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
  if (!socket.user) {
    socket.emit("error", { msg: "Authentication required" });
    socket.disconnect();
    return;
  }

  socket.on("join", async (data: JoinEvent, callback) => {
    const { code } = data;

    const gameExists = await redis.exists(`game:${code}:settings`);
    if (!gameExists) {
      socket.emit("error", { msg: "Game not found" });
      return;
    }

    socket.join(code);

    // Mettre l'utilisateur dans la liste des joueurs
    await redis.sadd(`game:${code}:players`, JSON.stringify({ id: socket.user?.id, name: socket.user?.username, image: socket.user?.image ?? null }));

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
      // Aucun joueur connecté, appliquer un TTL sur toutes les clés du jeu
      const gameKeys = await redis.keys(`game:${gameId}:*`);
      const ttl = 30 * 60; // 30 minutes
      
      for (const key of gameKeys) {
        await redis.expire(key, ttl);
      }
      
      console.log(`TTL of ${ttl}s applied to ${gameKeys.length} keys for game ${gameId}`);
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
    
    const answerData = JSON.stringify({ userId: socket.user?.id, answer, timestamp: Date.now() });
    await redis.lpush(`game:${gameId}:answers:q${currentQuestionIndex}:answers`, answerData);

    // emit vers la room
    socket.to(gameId).emit("playerHasAnswered", { [socket.user.id]: true})
    callback({ success: true, answer: answerData });
  })



  socket.on("answerVote", async (data) => {
    const { votes } = data;
    console.log(data)
    
    // Vérifier que l'utilisateur est dans une partie
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    if (rooms.length === 0) {
      socket.emit("error", { msg: "You are not in a game" });
      return;
    }

    const gameId = rooms[0];

    // Validation des paramètres requis
    if (!votes || !Array.isArray(votes)) {
      socket.emit("error", { msg: "Missing or invalid votes array" });
      return;
    }

    try {
      const currentQuestionIndex = await redis.get(`game:${gameId}:currentQuestionIndex`) || "0";
      
      // Parcourir tous les votes
      for (const vote of votes) {
        const answerId = Object.keys(vote)[0];
        const voteType = vote[answerId];

        // Validation du vote type
        if (!["good", "neutral", "bad"].includes(voteType)) {
          continue; // Skip invalid votes
        }

        // Stocker le vote dans Redis
        // Structure: game:${gameId}:scores:q${currentQuestionIndex}:${answerId} -> vote type
        const scoreKey = `game:${gameId}:scores:q${currentQuestionIndex}:${answerId}`;
        await redis.lpush(scoreKey, voteType);
      }

      socket.emit("voteReceived", { 
        questionIndex: currentQuestionIndex,
        votesCount: votes.length
      });

      console.log(`Votes received for game ${gameId}, question ${currentQuestionIndex}: ${votes.length} votes`);
    } catch (error) {
      console.error("Error storing votes:", error);
      socket.emit("error", { msg: "Failed to store votes" });
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
    console.log(host)
    const user = socket.user;
    if (host !== user?.id || !host) {
      socket.emit("error", { msg: "You are not the host" });
    } 

    settings.host = host ?? undefined 

    //update les settings dans redis
    const hset = convertObjectToHMSet(settings);

    settings.host = settings.host ? JSON.parse(settings.host as unknown as string) : null;
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
