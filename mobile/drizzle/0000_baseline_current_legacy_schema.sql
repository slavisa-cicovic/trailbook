CREATE TABLE `app_kv` (
	`storage_key` text PRIMARY KEY NOT NULL,
	`json_value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `diagnostic_events` (
	`local_id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`severity` text NOT NULL,
	`trip_local_id` text,
	`segment_local_id` text,
	`payload_json` text,
	`recorded_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_diagnostic_events_recorded_at` ON `diagnostic_events` (`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_events_trip_recorded_at` ON `diagnostic_events` (`trip_local_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_events_category_severity_recorded_at` ON `diagnostic_events` (`category`,`severity`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `raw_location_events` (
	`local_id` text PRIMARY KEY NOT NULL,
	`trip_local_id` text NOT NULL,
	`session_started_at` text,
	`active_segment_local_id` text,
	`batch_id` text NOT NULL,
	`batch_index` integer NOT NULL,
	`callback_source` text NOT NULL,
	`origin` text NOT NULL,
	`received_at` text NOT NULL,
	`recorded_at` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`accuracy` real,
	`altitude` real,
	`speed` real,
	`processing_status` text NOT NULL,
	`processing_decision` text,
	`processed_at` text,
	`accepted_trip_point_local_id` text,
	`segment_local_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_raw_location_events_trip_recorded_at` ON `raw_location_events` (`trip_local_id`,`recorded_at`,`batch_index`);--> statement-breakpoint
CREATE INDEX `idx_raw_location_events_trip_status_recorded_at` ON `raw_location_events` (`trip_local_id`,`processing_status`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_raw_location_events_batch_id` ON `raw_location_events` (`batch_id`,`batch_index`);--> statement-breakpoint
CREATE TABLE `recording_native_events` (
	`local_id` text PRIMARY KEY NOT NULL,
	`trip_local_id` text,
	`event_type` text NOT NULL,
	`recorded_at` text NOT NULL,
	`payload_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_recording_native_events_trip_recorded_at` ON `recording_native_events` (`trip_local_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_recording_native_events_type_recorded_at` ON `recording_native_events` (`event_type`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_local_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text NOT NULL,
	`attempt_count` integer NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sync_outbox_status_created_at` ON `sync_outbox` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_outbox_pending_entity_operation` ON `sync_outbox` (`entity_type`,`entity_local_id`,`operation`) WHERE "sync_outbox"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE TABLE `trip_diagnostics` (
	`trip_local_id` text PRIMARY KEY NOT NULL,
	`accepted` integer NOT NULL,
	`accepted_after_long_gap` integer NOT NULL,
	`accuracy_histogram_json` text NOT NULL,
	`background_accepted` integer NOT NULL,
	`background_callbacks` integer NOT NULL,
	`background_rejected` integer NOT NULL,
	`callback_count` integer NOT NULL,
	`decision_count` integer NOT NULL,
	`duplicate_coordinates` integer NOT NULL,
	`duplicate_timestamp` integer NOT NULL,
	`foreground_accepted` integer NOT NULL,
	`foreground_callbacks` integer NOT NULL,
	`foreground_rejected` integer NOT NULL,
	`max_callback_gap_ms` integer NOT NULL,
	`max_recorded_gap_ms` integer NOT NULL,
	`max_silent_gap_ms` integer NOT NULL,
	`platform` text NOT NULL,
	`recent_events_json` text NOT NULL,
	`recording_mode` text NOT NULL,
	`rejected_by_accuracy` integer NOT NULL,
	`rejected_by_implied_speed` integer NOT NULL,
	`rejected_by_jump_distance` integer NOT NULL,
	`rejected_by_min_movement` integer NOT NULL,
	`session_duplicate_recorded_at` integer NOT NULL,
	`silent_gap_count` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trip_group_members` (
	`local_id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`group_local_id` text NOT NULL,
	`trip_local_id` text NOT NULL,
	`device_id` text NOT NULL,
	`user_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trip_group_members_user_group_deleted_sort` ON `trip_group_members` (`user_id`,`group_local_id`,`deleted_at`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_trip_group_members_user_trip_deleted` ON `trip_group_members` (`user_id`,`trip_local_id`,`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trip_group_members_active_trip` ON `trip_group_members` (`group_local_id`,`trip_local_id`) WHERE "trip_group_members"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `trip_groups` (
	`local_id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`device_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trip_groups_user_id_deleted_at_updated_at` ON `trip_groups` (`user_id`,`deleted_at`,`updated_at`);--> statement-breakpoint
CREATE TABLE `trip_pauses` (
	`local_id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`trip_local_id` text NOT NULL,
	`device_id` text NOT NULL,
	`user_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`sync_status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trip_pauses_trip_local_id_started_at` ON `trip_pauses` (`trip_local_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `trip_points` (
	`local_id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`trip_local_id` text NOT NULL,
	`segment_local_id` text,
	`device_id` text NOT NULL,
	`user_id` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`recorded_at` text NOT NULL,
	`accuracy` real,
	`altitude` real,
	`speed` real,
	`sync_status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trip_points_trip_local_id_recorded_at` ON `trip_points` (`trip_local_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_trip_points_user_id` ON `trip_points` (`user_id`);--> statement-breakpoint
CREATE TABLE `trip_route_variants` (
	`local_id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`trip_local_id` text NOT NULL,
	`variant_type` text NOT NULL,
	`provider` text NOT NULL,
	`geometry_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_trip_route_variants_trip_type` ON `trip_route_variants` (`trip_local_id`,`variant_type`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `trip_segment_stats` (
	`segment_local_id` text PRIMARY KEY NOT NULL,
	`trip_local_id` text NOT NULL,
	`point_count` integer NOT NULL,
	`distance_meters` real NOT NULL,
	`duration_ms` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trip_segment_stats_trip_local_id` ON `trip_segment_stats` (`trip_local_id`);--> statement-breakpoint
CREATE TABLE `trip_segments` (
	`local_id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`trip_local_id` text NOT NULL,
	`device_id` text NOT NULL,
	`user_id` text NOT NULL,
	`recording_profile` text NOT NULL,
	`point_count` integer,
	`distance_meters` real,
	`duration_ms` integer,
	`stats_updated_at` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`sync_status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trip_segments_trip_local_id_started_at` ON `trip_segments` (`trip_local_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `trip_stats` (
	`trip_local_id` text PRIMARY KEY NOT NULL,
	`point_count` integer NOT NULL,
	`distance_meters` real NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`local_id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`device_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`recording_profile` text NOT NULL,
	`recording_config_json` text,
	`battery_start_level_percent` real,
	`battery_start_state` text,
	`battery_end_level_percent` real,
	`battery_end_state` text,
	`point_count` integer,
	`distance_meters` real,
	`stats_updated_at` text,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trips_user_id_updated_at` ON `trips` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `waypoint_attachments` (
	`local_id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`waypoint_local_id` text NOT NULL,
	`device_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`local_uri` text NOT NULL,
	`mime_type` text,
	`file_size` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_waypoint_attachments_waypoint_local_id_created_at` ON `waypoint_attachments` (`waypoint_local_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `waypoints` (
	`local_id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`trip_local_id` text NOT NULL,
	`segment_local_id` text,
	`device_id` text NOT NULL,
	`user_id` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_waypoints_trip_local_id_created_at` ON `waypoints` (`trip_local_id`,`created_at`);