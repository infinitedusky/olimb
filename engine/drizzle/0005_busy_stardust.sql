ALTER TABLE "session" ADD COLUMN "branch" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "worktree_path" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "subject_ref" jsonb;