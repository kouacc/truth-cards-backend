import { db } from "../db/drizzle";
import { sql } from "drizzle-orm";
import { category, question, sets } from "../db/schemas/schema";
import { user } from "../db/schemas/auth-schema";
import { client } from "./redis";

const CACHE_KEY = "stats:global";
const CACHE_TTL = 60 * 10

export async function getStats(): Promise<{
    categoriesCount: number;
    usersCount: number;
    questionsCount: number;
    setsCount: number;
}> {
    const cached = await client.get(CACHE_KEY);
    if (cached) {
        return JSON.parse(cached);
    }

    const result = await db.execute(sql`
        SELECT 
            (SELECT COUNT(*) FROM categorie) as categories_count,
            (SELECT COUNT(*) FROM user) as users_count,
            (SELECT COUNT(*) FROM question) as questions_count,
            (SELECT COUNT(*) FROM sets) as sets_count
    `);

    const row = result.rows[0] as any;

    const stats = {
        categoriesCount: Number(row.categories_count),
        usersCount: Number(row.users_count),
        questionsCount: Number(row.questions_count),
        setsCount: Number(row.sets_count)
    };

    await client.set(CACHE_KEY, JSON.stringify(stats));
    await client.expire(CACHE_KEY, CACHE_TTL);

    return stats;
}