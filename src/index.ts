import { Hono } from 'hono'
import { healthCheck, admin, games, userSets } from './routes'
import { auth } from '../utils/auth';
import { cors } from "hono/cors";
import { Server } from "socket.io";
import { Server as Engine } from "@socket.io/bun-engine";
import { client as redis } from '../utils/redis';
import { serveStatic } from 'hono/bun';
import { instrument } from '@socket.io/admin-ui';
import { deleteProfilePicture, uploadProfilePicture } from '../utils/bucket';

const app = new Hono();

export const io = new Server();
const engine = new Engine();
io.bind(engine)

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

    // Mettre l’utilisateur dans la liste des joueurs
    await redis.sadd(`game:${code}:players`, (socket as any).user ? JSON.stringify({ id: (socket as any).user.id, name: (socket as any).user.username }) : JSON.stringify({ id: userId, name: `Guest ${userId.split('_')[1].substring(0, 8)}` }));

    socket.emit("joined", { game: code });

	  io.to(code).emit("players", { players: await redis.smembers(`game:${code}:players`) });
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
});

io.use(async (socket, next) => {
  const headers = socket.handshake.headers;

  const session = await auth.api.getSession({ headers: headers as any })

  if (session) {
    (socket as any).user = session.user;
    return next();
  }
  return next();
})

instrument(io, {
  auth: false
});

const { websocket } = engine.handler();

app.use(
	"*", // or replace with "*" to enable cors for all routes
	cors({
		origin: [process.env.NODE_ENV === "production" ? "https://admin.truthcards.maxencelallemand.fr" : "http://localhost:5173", "https://admin.socket.io"],
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["POST", "GET", "OPTIONS", "PUT", "DELETE", "PATCH"],
		exposeHeaders: ["Content-Length"],
		maxAge: 600,
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return auth.handler(c.req.raw);
});

app.route('/health', healthCheck)
app.route('/games', games)
app.route('/admin', admin)
app.route('/custom', userSets)

app.get('/version', (c) => {
  // TODO: return version id
  // if client has the same version, return 204 no content
  // if not, redirect to /version/diff    

  return c.json({ version: Bun.version });
})

app.get('/version/diff', (c) => {
  // TODO: return the differences in assets between the client and the server
  return c.json({ diff: "Not implemented" });
})

app.get('/legal/cgu', async (c) => {
  const cgu = Bun.file('./assets/cgu.md');
  const text = await cgu.text();
  return c.text(text)
})

app.get('/legal/mentions', async (c) => {
  const mentions = Bun.file('./assets/mentions.md');
  const text = await mentions.text();
  return c.text(text)
})

app.get('/legal/privacy', async (c) => {
  const privacy = Bun.file('./assets/privacy.md');
  const text = await privacy.text();
  return c.text(text)
})

app.post('/user/picture', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const user = session?.user;

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // delete old image from the bucket
  if (user.image) {
    const filename = user.image.split('/').pop();
    await deleteProfilePicture(user.id, filename!);
  }

  const form = await c.req.formData();
  const file = form.get('profile_picture') as File;

  if (!file || !file.type.startsWith('image/')) {
    return c.json({ error: 'Invalid file' }, 400);
  }

  const profilePictureUrl = await uploadProfilePicture(user.id, file);

  await auth.api.updateUser({
    body: {
      image: profilePictureUrl
    },
    headers: c.req.raw.headers
  })

  return c.json({ profilePictureUrl });
})

app.use('/static/*', serveStatic({ root: './' }))

export default {
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  
  fetch(req: any, server: any) {
    const url = new URL(req.url);

    if (url.pathname === "/socket.io/") {
      return engine.handleRequest(req, server);
    } else {
      return app.fetch(req, server);
    }
  },
  
  websocket
}
