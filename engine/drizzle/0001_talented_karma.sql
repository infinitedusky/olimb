ALTER TABLE "run" DROP CONSTRAINT "run_kind";--> statement-breakpoint
ALTER TABLE "run" ALTER COLUMN "phase_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "decision" ADD COLUMN "task_id" text;--> statement-breakpoint
ALTER TABLE "decision" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "task_id" text;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_kind" CHECK ("run"."kind" in ('plan', 'build', 'follow_up', 'verify', 'merge', 'setup', 'measure'));