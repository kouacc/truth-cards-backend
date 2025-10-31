import { db } from "../db/drizzle";
import { sql } from "drizzle-orm";
import { client } from "./redis";

const CACHE_KEY = "stats:global";
const CACHE_TTL = 60 * 10

interface StatsQueryResult {
    categories_count: string | number;
    users_count: string | number;
    questions_count: string | number;
    sets_count: string | number;
}

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

    const row = result.rows[0] as unknown as StatsQueryResult;

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