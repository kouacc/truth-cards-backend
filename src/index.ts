import { Hono } from 'hono'
import { healthCheck, admin, games, userSets } from './routes'
import { auth } from '../utils/auth';
import { cors } from "hono/cors";
import { serveStatic } from 'hono/bun';
import { deleteProfilePicture, uploadProfilePicture } from '../utils/bucket';
import { io as socketIo, engine, websocket } from './socket';

export const io = socketIo;

const app = new Hono();

app.use(
	"*",
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
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetch(req: Request, server: Bun.Server<any>) {
    const url = new URL(req.url);

    if (url.pathname === "/socket.io/") {
      return engine.handleRequest(req, server);
    } else {
      return app.fetch(req, server);
    }
  },
  
  websocket
}
