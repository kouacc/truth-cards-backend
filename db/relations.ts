import { relations } from "drizzle-orm";
import { answers, category, question, games, reports, sets } from "./schemas/schema";
import { user } from "./schemas/auth-schema";

export const questionRelations = relations(question, ({ one, many }) => ({
    category: one(category, {
        fields: [question.category],
        references: [category.id],
    }),
    set: one(sets, {
        fields: [question.setId],
        references: [sets.id],
    }),
    answers: many(answers)
}));

export const answersRelations = relations(answers, ({ one }) => ({
    question: one(question, {
        fields: [answers.questionId],
        references: [question.id],
    }),
    createdBy: one(user, {
        fields: [answers.createdBy],
        references: [user.id],
    })
}));

export const categoryRelations = relations(category, ({ many }) => ({
    questions: many(question)
}));

export const setsRelations = relations(sets, ({ one, many }) => ({
    createdBy: one(user, {
        fields: [sets.created_by],
        references: [user.id],
    }),
    questions: many(question)
}));

export const usersRelations = relations(user, ({ many, one }) => ({
    games: one(games, {
        fields: [user.id],
        references: [games.id],
    }),
    answers: many(answers),
    questions: many(question),
    categories: many(category),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
    userReporting: one(user, {
        fields: [reports.userReporting],
        references: [user.id],
    }),
    userReported: one(user, {
        fields: [reports.userReported],
        references: [user.id],
    }),
}));