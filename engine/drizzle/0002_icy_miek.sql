ALTER TABLE "session" ALTER COLUMN "phase_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_message" ALTER COLUMN "status" SET DEFAULT 'sent';--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "kind" text DEFAULT 'talk' NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "cwd" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "agent_session_id" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_message" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_message" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_message_session" ON "session_message" USING btree ("session_id","id");--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_kind" CHECK ("session"."kind" in ('talk', 'phase'));