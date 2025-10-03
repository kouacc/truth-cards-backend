import { Hono } from 'hono'
import { healthCheck, ws, games } from './routes'
import { auth } from '../utils/auth';
import { admin } from './routes/admin';
import { cors } from "hono/cors";
import { Server } from "socket.io";
import { Server as Engine } from "@socket.io/bun-engine";
import { redis } from 'bun';
import { serveStatic } from 'hono/bun';
import { instrument } from '@socket.io/admin-ui';

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
    await redis.rpush(`game:${gameId}:answers`, JSON.stringify({ userId, answer, timestamp: Date.now(), questionIndex: await redis.get(`game:${gameId}:currentQuestionIndex`) }));

    socket.emit("answerReceived", { answer });
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
		origin: ["http://localhost:5173", "https://admin.socket.io"],
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["POST", "GET", "OPTIONS"],
		exposeHeaders: ["Content-Length"],
		maxAge: 600,
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return auth.handler(c.req.raw);
});

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.route('/health', healthCheck)
app.route('/games', games)
app.route('/ws', ws)
app.route('/admin', admin)

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
