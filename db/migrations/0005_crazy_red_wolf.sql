ALTER TABLE "question" DROP CONSTRAINT "question_category_categorie_id_fk";
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_user_reporting_user_id_fk";
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_user_reported_user_id_fk";
--> statement-breakpoint
ALTER TABLE "sets" DROP CONSTRAINT "sets_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_category_categorie_id_fk" FOREIGN KEY ("category") REFERENCES "public"."categorie"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_reporting_user_id_fk" FOREIGN KEY ("user_reporting") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_reported_user_id_fk" FOREIGN KEY ("user_reported") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;