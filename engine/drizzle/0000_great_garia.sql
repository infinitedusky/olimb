CREATE TABLE "app" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"setup" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision" (
	"id" text PRIMARY KEY NOT NULL,
	"idea_id" text,
	"plan_id" text,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"chosen" text,
	"provisional" boolean DEFAULT false NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"rationale" text
);
--> statement-breakpoint
CREATE TABLE "event" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" text NOT NULL,
	"app_id" text,
	"idea_id" text,
	"plan_id" text,
	"task_id" text,
	"run_id" text,
	"session_id" text,
	"actor" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"idea_id" text,
	"pr_id" text,
	"kind" text NOT NULL,
	"metric" text,
	"value" numeric,
	"baseline_value" numeric,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"provider" text,
	"summary" text,
	"raw" jsonb,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_kind" CHECK ("evidence"."kind" in ('baseline', 'finding', 'verdict', 'guard', 'post_ship'))
);
--> statement-breakpoint
CREATE TABLE "idea" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"source" text NOT NULL,
	"source_ref" jsonb,
	"lane" text DEFAULT 'inbox' NOT NULL,
	"hypothesis" text,
	"baseline" jsonb,
	"measures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"testability" jsonb,
	"look_by" date,
	"decision" text,
	"decided_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "idea_source" CHECK ("idea"."source" in ('person', 'agent', 'telemetry')),
	CONSTRAINT "idea_lane" CHECK ("idea"."lane" in ('inbox', 'measuring', 'build', 'testing', 'shipped', 'parked', 'killed')),
	CONSTRAINT "idea_decision" CHECK ("idea"."decision" is null or "idea"."decision" in ('yes', 'no', 'not_yet'))
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"idea_id" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'drafting' NOT NULL,
	"integration_branch" text,
	"spec" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_status" CHECK ("plan"."status" in ('drafting', 'proposed', 'approved', 'running', 'landed', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "pr" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"repo_id" text,
	"number" integer,
	"url" text,
	"head_branch" text,
	"base_branch" text,
	"head_sha" text,
	"merge_sha" text,
	"status" text NOT NULL,
	"additions" integer,
	"deletions" integer,
	"changed_files" integer,
	"readiness" jsonb,
	"signals" jsonb,
	"pitch" jsonb,
	"opened_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	CONSTRAINT "pr_status" CHECK ("pr"."status" in ('draft', 'open', 'queued', 'merged', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "provider_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"role" text NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_ref" text,
	"status" text,
	"checked_at" timestamp with time zone,
	CONSTRAINT "provider_role" CHECK ("provider_connection"."role" in ('telemetry', 'code_host', 'design_system', 'model', 'sandbox', 'traces'))
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" text PRIMARY KEY NOT NULL,
	"idea_id" text,
	"task_id" text,
	"run_id" text,
	"text" text NOT NULL,
	"options" jsonb,
	"cost" text,
	"status" text DEFAULT 'open' NOT NULL,
	"answer" text,
	"answered_by" text,
	"answered_at" timestamp with time zone,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_status" CHECK ("question"."status" in ('open', 'answered', 'skipped', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "repo" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"full_name" text NOT NULL,
	"local_path" text,
	"writable" boolean DEFAULT true NOT NULL,
	"base_branch" text
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"session_id" text,
	"attempt" integer NOT NULL,
	"kind" text NOT NULL,
	"agent" text NOT NULL,
	"model" text,
	"status" text DEFAULT 'starting' NOT NULL,
	"agent_session_id" text,
	"pid" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"cost_usd" numeric,
	"budget_cap_usd" numeric,
	"tokens" jsonb,
	"summary" text,
	"error" text,
	CONSTRAINT "run_kind" CHECK ("run"."kind" in ('build', 'follow_up', 'verify', 'merge', 'setup', 'measure')),
	CONSTRAINT "run_status" CHECK ("run"."status" in ('starting', 'working', 'ready', 'completed', 'failed', 'stopped', 'interrupted'))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_status" CHECK ("session"."status" in ('open', 'ended'))
);
--> statement-breakpoint
CREATE TABLE "session_message" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "session_message_status" CHECK ("session_message"."status" in ('queued', 'sent', 'interrupted', 'dropped'))
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"plan_id" text,
	"idea_id" text,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"brief" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"branch" text,
	"worktree_path" text,
	"base_sha" text,
	"size" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"requires_schema_change" boolean DEFAULT false NOT NULL,
	"auto_merge" boolean,
	"held_reason" text,
	"assignee" text,
	"created_by" text,
	"pr_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "task_status" CHECK ("task"."status" in ('queued', 'ready', 'running', 'awaiting_answer', 'merging', 'testing', 'done', 'failed', 'cancelled')),
	CONSTRAINT "task_size" CHECK ("task"."size" is null or "task"."size" in ('S', 'M', 'L', 'XL'))
);
--> statement-breakpoint
CREATE TABLE "task_dependency" (
	"task_id" text NOT NULL,
	"depends_on_task_id" text NOT NULL,
	CONSTRAINT "task_dependency_task_id_depends_on_task_id_pk" PRIMARY KEY("task_id","depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "task_file_claim" (
	"task_id" text NOT NULL,
	"path" text NOT NULL,
	CONSTRAINT "task_file_claim_task_id_path_pk" PRIMARY KEY("task_id","path")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text,
	"email" text,
	"github_login" text,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_role" CHECK ("user"."role" in ('owner', 'member', 'member_no_merge'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"pr_id" text,
	"run_id" text,
	"kind" text NOT NULL,
	"label" text,
	"name" text NOT NULL,
	"route" text,
	"blob_url" text,
	"notes" jsonb,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_kind" CHECK ("verification"."kind" in ('screenshot', 'video', 'flow_diff', 'expectation', 'story', 'numbers')),
	CONSTRAINT "verification_label" CHECK ("verification"."label" is null or "verification"."label" in ('feature', 'entry_point', 'before', 'after', 'failing_now_passing', 'data_effect'))
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app" ADD CONSTRAINT "app_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea" ADD CONSTRAINT "idea_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea" ADD CONSTRAINT "idea_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr" ADD CONSTRAINT "pr_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr" ADD CONSTRAINT "pr_repo_id_repo_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo" ADD CONSTRAINT "repo_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_message" ADD CONSTRAINT "session_message_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_user_id_fk" FOREIGN KEY ("assignee") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_depends_on_task_id_task_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_file_claim" ADD CONSTRAINT "task_file_claim_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_pr_id_pr_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pr"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_workspace_seq" ON "event" USING btree ("workspace_id","seq");--> statement-breakpoint
CREATE INDEX "event_task_seq" ON "event" USING btree ("task_id","seq");--> statement-breakpoint
CREATE INDEX "event_plan_seq" ON "event" USING btree ("plan_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "idea_app_number" ON "idea" USING btree ("app_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "pr_repo_number" ON "pr" USING btree ("repo_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connection_role_provider" ON "provider_connection" USING btree ("app_id","role","provider");--> statement-breakpoint
CREATE INDEX "run_task" ON "run" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_app_number" ON "task" USING btree ("app_id","number");--> statement-breakpoint
CREATE INDEX "task_plan" ON "task" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_task_name" ON "verification" USING btree ("task_id","name");