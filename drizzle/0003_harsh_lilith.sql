CREATE TABLE `wa_intakes` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`raw_text` text NOT NULL,
	`summary` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wa_intakes_content_hash_unique` ON `wa_intakes` (`content_hash`);