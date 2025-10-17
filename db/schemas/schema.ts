import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createID } from "../../utils";
import type { InferSelectModel } from "drizzle-orm";
import { user } from "./auth-schema";

export const category = pgTable('categorie', {
    id: text("id").primaryKey().notNull().$defaultFn(() => createID()),
    title: text("title").notNull(),
    description: text("description").notNull(),
    assets: text("assets").notNull(),
})

export const question = pgTable('question', {
    id: text("id").primaryKey().notNull().$defaultFn(() => createID()),
    question: text("question").notNull(),
    answer: text("answer"),
    category: text("category").references(() => category.id, { onDelete: 'cascade'}),
    setId: text("set_id").references(() => sets.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
})

export const sets = pgTable('sets', {
    id: text("id").primaryKey().notNull().$defaultFn(() => createID()),
    title: text("title").notNull(),
    created_by: text("created_by").notNull().references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
})

export const games = pgTable('games', {
    id: text("id").primaryKey().notNull().$defaultFn(() => createID(32)),
    uid: text("uid").notNull().references(() => user.id),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"),
})

export const answers = pgTable('answers', {
    sessionId: text("session_id").notNull().references(() => games.id),
    questionId: text("question_id").notNull().references(() => question.id),
    answer: text("answer").notNull(),
    answeredAt: timestamp("answered_at").notNull().defaultNow(),
    createdBy: text("created_by").notNull().references(() => user.id),
})

export const reports = pgTable('reports', {
    id: text("id").primaryKey().notNull().$defaultFn(() => createID(32)),
    userReporting: text("user_reporting").notNull().references(() => user.id, { onDelete: "cascade" }),
    userReported: text("user_reported").notNull().references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    details: text("details"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
})

export type Category = InferSelectModel<typeof category>;
export type Question = InferSelectModel<typeof question>;
export type User = InferSelectModel<typeof user>;
export type Game = InferSelectModel<typeof games>;
export type Answer = InferSelectModel<typeof answers>;
export type Report = InferSelectModel<typeof reports>;