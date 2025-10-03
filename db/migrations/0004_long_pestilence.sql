CREATE TABLE "sets" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "answer" text;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "set_id" text;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE no action ON UPDATE no action;