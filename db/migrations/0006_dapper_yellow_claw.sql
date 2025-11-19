ALTER TABLE "games" RENAME COLUMN "uid" TO "players";--> statement-breakpoint
ALTER TABLE "answers" DROP CONSTRAINT "answers_session_id_games_id_fk";
--> statement-breakpoint
ALTER TABLE "answers" DROP CONSTRAINT "answers_question_id_question_id_fk";
--> statement-breakpoint
ALTER TABLE "games" DROP CONSTRAINT "games_uid_user_id_fk";
--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "id" text PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "is_valid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "game_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" DROP COLUMN "session_id";--> statement-breakpoint
ALTER TABLE "answers" DROP COLUMN "question_id";--> statement-breakpoint
ALTER TABLE "answers" DROP COLUMN "answer";--> statement-breakpoint
ALTER TABLE "answers" DROP COLUMN "answered_at";