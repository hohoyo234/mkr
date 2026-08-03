CREATE TABLE `activity_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`zone` text NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`amount_cents` integer,
	`created_at` integer NOT NULL
);
