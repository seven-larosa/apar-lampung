CREATE TABLE `knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`r2_key` text NOT NULL,
	`extracted_text` text NOT NULL,
	`status` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL
);
