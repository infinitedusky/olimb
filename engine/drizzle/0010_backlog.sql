CREATE TABLE "backlog_item" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"project_id" text NOT NULL,
	"text" text NOT NULL,
	"body" text,
	"source" text NOT NULL,
	"source_ref" jsonb,
	"idea_id" text,
	"state" text DEFAULT 'open' NOT NULL,
	"task_id" text,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "backlog_item_source" CHECK ("backlog_item"."source" in ('person', 'agent', 'idea', 'planner', 'builder')),
	CONSTRAINT "backlog_item_state" CHECK ("backlog_item"."state" in ('open', 'covered', 'dropped')),
	CONSTRAINT "backlog_item_resolution" CHECK (("backlog_item"."state" = 'open') or ("backlog_item"."state" = 'covered' and "backlog_item"."task_id" is not null) or ("backlog_item"."state" = 'dropped' and "backlog_item"."reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_app_id_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_project_app_fk" FOREIGN KEY ("project_id","app_id") REFERENCES "public"."project"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_task_app_fk" FOREIGN KEY ("task_id","app_id") REFERENCES "public"."task"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_item" ADD CONSTRAINT "backlog_item_idea_app_fk" FOREIGN KEY ("idea_id","app_id") REFERENCES "public"."idea"("id","app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backlog_item_project" ON "backlog_item" USING btree ("project_id");