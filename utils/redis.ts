import { RedisClient } from "bun";

export const client = new RedisClient(process.env.REDIS_URL);

export function convertObjectToHMSet(obj: Record<string, unknown>): string[] {
    const keys = Object.keys(obj);
    const values = Object.values(obj);

    return keys.flatMap((key, index) => [key, String(values[index])]);
}
