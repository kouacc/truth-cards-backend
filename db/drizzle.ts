import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "./schemas/schema";
import * as authSchema from "./schemas/auth-schema";
import * as relations from "./relations";

export const db = drizzle(process.env.DATABASE_URL!, { schema: { ...schema, ...authSchema, ...relations } });