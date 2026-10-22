-- Every row below an app carries app_id (hand-ordered: drizzle's draft added NOT NULL columns to tables with rows).
-- 1. Add the columns, nullable for now.
ALTER TABLE "decision" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "phase_dependency" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "phase_file_claim" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "pr" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "session_message" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "step" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "verification" ADD COLUMN "app_id" text;--> statement-breakpoint
-- 2. Backfill from the parent.
UPDATE "decision" d SET app_id = p.app_id FROM "plan" p WHERE d.plan_id = p.id AND d.app_id IS NULL;--> statement-breakpoint
UPDATE "decision" d SET app_id = i.app_id FROM "idea" i WHERE d.idea_id = i.id AND d.app_id IS NULL;--> statement-breakpoint
UPDATE "question" q SET app_id = p.app_id FROM "plan" p WHERE q.plan_id = p.id AND q.app_id IS NULL;--> statement-breakpoint
UPDATE "question" q SET app_id = ph.app_id FROM "phase" ph WHERE q.phase_id = ph.id AND q.app_id IS NULL;--> statement-breakpoint
UPDATE "run" r SET app_id = ph.app_id FROM "phase" ph WHERE r.phase_id = ph.id AND r.app_id IS NULL;--> statement-breakpoint
UPDATE "run" r SET app_id = t.app_id FROM "task" t WHERE r.task_id = t.id AND r.app_id IS NULL;--> statement-breakpoint
UPDATE "step" s SET app_id = ph.app_id FROM "phase" ph WHERE s.phase_id = ph.id AND s.app_id IS NULL;--> statement-breakpoint
UPDATE "pr" x SET app_id = p.app_id FROM "plan" p WHERE x.plan_id = p.id AND x.app_id IS NULL;--> statement-breakpoint
UPDATE "verification" v SET app_id = ph.app_id FROM "phase" ph WHERE v.phase_id = ph.id AND v.app_id IS NULL;--> statement-breakpoint
UPDATE "evidence" e SET app_id = i.app_id FROM "idea" i WHERE e.idea_id = i.id AND e.app_id IS NULL;--> statement-breakpoint
UPDATE "phase_dependency" d SET app_id = ph.app_id FROM "phase" ph WHERE d.phase_id = ph.id AND d.app_id IS NULL;--> statement-breakpoint
UPDATE "phase_file_claim" c SET app_id = ph.app_id FROM "phase" ph WHERE c.phase_id = ph.id AND c.app_id IS NULL;--> statement-breakpoint
UPDATE "session" s SET app_id = ph.app_id FROM "phase" ph WHERE s.phase_id = ph.id AND s.app_id IS NULL;--> statement-breakpoint
UPDATE "session_message" m SET app_id = s.app_id FROM "session" s WHERE m.session_id = s.id AND m.app_id IS NULL;--> statement-breakpoint
-- 3. What has no app after that was development chatter (conversations started with no app, their messages and events). It goes.
UPDATE "run" SET session_id = NULL WHERE session_id IN (SELECT id FROM "session" WHERE app_id IS NULL);--> statement-breakpoint
DELETE FROM "session_message" WHERE app_id IS NULL;--> statement-breakpoint
DELETE FROM "session" WHERE app_id IS NULL;--> statement-breakpoint
DELETE FROM "event" WHERE app_id IS NULL;--> statement-breakpoint
DELETE FROM "verification" WHERE app_id IS NULL;--> statement-breakpoint
DELETE FROM "step" WHERE app_id IS NULL;--> statement-breakpoint
DELETE FROM "run" WHERE app_id IS NULL;--> statement-breakpoint
DELETE FROM "decision" WHERE app_id IS NULL;--> statement-breakpoint
DELETE FROM "question" WHERE app_id IS NULL;--> statement-breakpoint
DELETE FROM "pr" WHERE app_id IS NULL;--> statement-breakpoint
DELETE FROM "evidence" WHERE app_id IS NULL;--> statement-breakpoint
DELETE FROM "phase_dependency" WHERE app_id IS NULL;--> statement-breakpoint
DELETE FROM "phase_file_claim" WHERE app_id IS NULL;--> statement-breakpoint
-- 4. Require it everywhere.
ALTER TABLE "event" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "decision" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "phase_dependency" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "phase_file_claim" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pr" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "question" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "run" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "session_message" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "step" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "app_id" SET NOT NULL;--> statement-breakpoint
-- 5. The parents' (id, app_id) keys, so children can reference them as a pair.
CREATE UNIQUE INDEX "idea_id_app" ON "idea" USING btree ("id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_id_app" ON "plan" USING btree ("id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_id_app" ON "task" USING btree ("id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "phase_id_app" ON "phase" USING btree ("id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_id_app" ON "session" USING btree ("id","app_id");--> statement-breakpoint
-- 6. Simple and composite foreign keys: a row's app is its parent's app.
ALTER TABLE "decision" ADD CONSTRAINT "decision_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_plan_app_fk" FOREIGN KEY ("plan_id","app_id") REFERENCES "public"."plan"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_idea_app_fk" FOREIGN KEY ("idea_id","app_id") REFERENCES "public"."idea"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase" ADD CONSTRAINT "phase_plan_app_fk" FOREIGN KEY ("plan_id","app_id") REFERENCES "public"."plan"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase" ADD CONSTRAINT "phase_task_app_fk" FOREIGN KEY ("task_id","app_id") REFERENCES "public"."task"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_dependency" ADD CONSTRAINT "phase_dependency_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_dependency" ADD CONSTRAINT "phase_dependency_phase_app_fk" FOREIGN KEY ("phase_id","app_id") REFERENCES "public"."phase"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_dependency" ADD CONSTRAINT "phase_dependency_on_app_fk" FOREIGN KEY ("depends_on_phase_id","app_id") REFERENCES "public"."phase"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_file_claim" ADD CONSTRAINT "phase_file_claim_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_file_claim" ADD CONSTRAINT "phase_file_claim_phase_app_fk" FOREIGN KEY ("phase_id","app_id") REFERENCES "public"."phase"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_idea_app_fk" FOREIGN KEY ("idea_id","app_id") REFERENCES "public"."idea"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr" ADD CONSTRAINT "pr_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr" ADD CONSTRAINT "pr_plan_app_fk" FOREIGN KEY ("plan_id","app_id") REFERENCES "public"."plan"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_plan_app_fk" FOREIGN KEY ("plan_id","app_id") REFERENCES "public"."plan"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_phase_app_fk" FOREIGN KEY ("phase_id","app_id") REFERENCES "public"."phase"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_task_app_fk" FOREIGN KEY ("task_id","app_id") REFERENCES "public"."task"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_phase_app_fk" FOREIGN KEY ("phase_id","app_id") REFERENCES "public"."phase"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_message" ADD CONSTRAINT "session_message_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_message" ADD CONSTRAINT "session_message_session_app_fk" FOREIGN KEY ("session_id","app_id") REFERENCES "public"."session"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step" ADD CONSTRAINT "step_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step" ADD CONSTRAINT "step_phase_app_fk" FOREIGN KEY ("phase_id","app_id") REFERENCES "public"."phase"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_plan_app_fk" FOREIGN KEY ("plan_id","app_id") REFERENCES "public"."plan"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_idea_app_fk" FOREIGN KEY ("idea_id","app_id") REFERENCES "public"."idea"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_phase_app_fk" FOREIGN KEY ("phase_id","app_id") REFERENCES "public"."phase"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- 7. Scoping indexes: (app_id, …) leads.
CREATE INDEX "decision_app" ON "decision" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "decision_plan" ON "decision" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "evidence_app" ON "evidence" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "plan_app" ON "plan" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "pr_app" ON "pr" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "question_app" ON "question" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "question_plan" ON "question" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "repo_app" ON "repo" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "run_app" ON "run" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "session_app" ON "session" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "verification_app" ON "verification" USING btree ("app_id");
