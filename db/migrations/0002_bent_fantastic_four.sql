CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_reporting" text NOT NULL,
	"user_reported" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_reporting_user_id_fk" FOREIGN KEY ("user_reporting") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_reported_user_id_fk" FOREIGN KEY ("user_reported") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;