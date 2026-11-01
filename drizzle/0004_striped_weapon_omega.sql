CREATE TABLE `spare_part_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`stock_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`requested_by` text NOT NULL,
	`created_at` text NOT NULL,
	`decided_by` text,
	`decided_at` text
);
