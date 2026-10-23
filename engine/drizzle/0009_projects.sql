-- The thing called a plan is a project now; "plan" is the verb (Plan, the planner). Renames only: no data moves.
ALTER TABLE "plan" RENAME TO "project";--> statement-breakpoint
ALTER TABLE "task" RENAME COLUMN "plan_id" TO "project_id";--> statement-breakpoint
ALTER TABLE "phase" RENAME COLUMN "plan_id" TO "project_id";--> statement-breakpoint
ALTER TABLE "decision" RENAME COLUMN "plan_id" TO "project_id";--> statement-breakpoint
ALTER TABLE "question" RENAME COLUMN "plan_id" TO "project_id";--> statement-breakpoint
ALTER TABLE "event" RENAME COLUMN "plan_id" TO "project_id";--> statement-breakpoint
ALTER TABLE "pr" RENAME COLUMN "plan_id" TO "project_id";--> statement-breakpoint
ALTER TABLE "decision" RENAME CONSTRAINT "decision_plan_app_fk" TO "decision_project_app_fk";--> statement-breakpoint
ALTER TABLE "decision" RENAME CONSTRAINT "decision_plan_id_plan_id_fk" TO "decision_project_id_project_id_fk";--> statement-breakpoint
ALTER TABLE "phase" RENAME CONSTRAINT "phase_plan_app_fk" TO "phase_project_app_fk";--> statement-breakpoint
ALTER TABLE "phase" RENAME CONSTRAINT "phase_plan_id_plan_id_fk" TO "phase_project_id_project_id_fk";--> statement-breakpoint
ALTER TABLE "project" RENAME CONSTRAINT "plan_app_id_app_id_fk" TO "project_app_id_app_id_fk";--> statement-breakpoint
ALTER TABLE "project" RENAME CONSTRAINT "plan_idea_app_fk" TO "project_idea_app_fk";--> statement-breakpoint
ALTER TABLE "project" RENAME CONSTRAINT "plan_idea_id_idea_id_fk" TO "project_idea_id_idea_id_fk";--> statement-breakpoint
ALTER TABLE "project" RENAME CONSTRAINT "plan_pkey" TO "project_pkey";--> statement-breakpoint
ALTER TABLE "project" RENAME CONSTRAINT "plan_status" TO "project_status";--> statement-breakpoint
ALTER TABLE "pr" RENAME CONSTRAINT "pr_plan_app_fk" TO "pr_project_app_fk";--> statement-breakpoint
ALTER TABLE "pr" RENAME CONSTRAINT "pr_plan_id_plan_id_fk" TO "pr_project_id_project_id_fk";--> statement-breakpoint
ALTER TABLE "question" RENAME CONSTRAINT "question_plan_app_fk" TO "question_project_app_fk";--> statement-breakpoint
ALTER TABLE "task" RENAME CONSTRAINT "task_plan_app_fk" TO "task_project_app_fk";--> statement-breakpoint
ALTER TABLE "task" RENAME CONSTRAINT "task_plan_id_plan_id_fk" TO "task_project_id_project_id_fk";--> statement-breakpoint
ALTER INDEX "decision_plan" RENAME TO "decision_project";--> statement-breakpoint
ALTER INDEX "event_plan_seq" RENAME TO "event_project_seq";--> statement-breakpoint
ALTER INDEX "phase_plan" RENAME TO "phase_project";--> statement-breakpoint
ALTER INDEX "plan_app" RENAME TO "project_app";--> statement-breakpoint
ALTER INDEX "plan_id_app" RENAME TO "project_id_app";--> statement-breakpoint
ALTER INDEX "question_plan" RENAME TO "question_project";--> statement-breakpoint
ALTER INDEX "task_plan" RENAME TO "task_project";
