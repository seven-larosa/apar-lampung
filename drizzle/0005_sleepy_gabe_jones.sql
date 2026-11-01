CREATE TABLE `workshop_assignments` (
	`order_id` text PRIMARY KEY NOT NULL,
	`assignee` text NOT NULL,
	`assigned_by` text NOT NULL,
	`assigned_at` text NOT NULL
);
