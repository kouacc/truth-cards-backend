import { Hono } from "hono";

const health = new Hono();

health.get("/", (c) => {
    return c.text("Ready");
});

health.get("/uptime", (c) => {
    const uptime = process.uptime();
    return c.json({ uptime });
})

export { health as healthCheck };