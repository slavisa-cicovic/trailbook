CREATE TABLE `capture_meta` (
	`trip_id` text PRIMARY KEY NOT NULL,
	`capture_schema_version` integer NOT NULL,
	`app_version` text NOT NULL,
	`os_api_level` integer NOT NULL,
	`device_model` text NOT NULL,
	`capture_time_zone` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `raw_activity_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`results` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `raw_activity_trip_id_idx` ON `raw_activity_samples` (`trip_id`);--> statement-breakpoint
CREATE TABLE `raw_device_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`battery_pct` integer NOT NULL,
	`is_charging` integer NOT NULL,
	`power_save_mode` integer NOT NULL,
	`gps_enabled` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `raw_device_trip_id_idx` ON `raw_device_samples` (`trip_id`);--> statement-breakpoint
CREATE TABLE `raw_location_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`accuracy_m` real,
	`altitude_m` real,
	`speed_mps` real,
	`bearing_deg` real,
	`provider` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `raw_location_trip_id_idx` ON `raw_location_samples` (`trip_id`);--> statement-breakpoint
CREATE TABLE `raw_session_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`type` text NOT NULL,
	`payload_json` text
);
--> statement-breakpoint
CREATE INDEX `raw_session_trip_id_idx` ON `raw_session_events` (`trip_id`);--> statement-breakpoint
CREATE TABLE `segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` text NOT NULL,
	`segment_index` integer NOT NULL,
	`segment_type` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`distance_m` real
);
--> statement-breakpoint
CREATE INDEX `segments_trip_id_idx` ON `segments` (`trip_id`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_trip_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`status` text NOT NULL,
	`processing_version` integer DEFAULT 0 NOT NULL,
	`sync_state` text DEFAULT 'PENDING' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trips_client_trip_id_unique` ON `trips` (`client_trip_id`);--> statement-breakpoint
CREATE TABLE `waypoint_images` (
	`id` text PRIMARY KEY NOT NULL,
	`waypoint_id` text NOT NULL,
	`source` text NOT NULL,
	`local_uri` text NOT NULL,
	`captured_at` text,
	`object_key` text,
	`upload_state` text DEFAULT 'PENDING' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `waypoint_images_waypoint_id_idx` ON `waypoint_images` (`waypoint_id`);--> statement-breakpoint
CREATE TABLE `waypoints` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `waypoints_trip_id_idx` ON `waypoints` (`trip_id`);
