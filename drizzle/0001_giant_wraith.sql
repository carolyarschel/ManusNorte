CREATE TABLE `absences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consultant_id` int NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `absences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`project_id` int NOT NULL,
	`consultant_id` int NOT NULL,
	`weekday` int NOT NULL,
	`role` enum('líder','consultor') NOT NULL DEFAULT 'consultor',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consultants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`level` enum('junior','pleno','senior') NOT NULL DEFAULT 'junior',
	`is_leader` boolean NOT NULL DEFAULT false,
	`max_days` int NOT NULL DEFAULT 5,
	`restrictions` json NOT NULL DEFAULT ('[]'),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consultants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `level_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`project_id` int NOT NULL,
	`level` enum('junior','pleno','senior') NOT NULL,
	`is_leader` boolean NOT NULL DEFAULT false,
	`days_per_week` int NOT NULL DEFAULT 1,
	`visit_days` json NOT NULL DEFAULT ('[]'),
	`assigned_consultant_id` int,
	`assigned_days` json NOT NULL DEFAULT ('[]'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `level_slots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pinned_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`project_id` int NOT NULL,
	`consultant_id` int NOT NULL,
	`days_per_week` int NOT NULL DEFAULT 1,
	`visit_days` json NOT NULL DEFAULT ('[]'),
	`assigned_days` json NOT NULL DEFAULT ('[]'),
	`cadence` enum('weekly','biweekly_odd','biweekly_even') DEFAULT 'weekly',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pinned_slots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`acronym` varchar(5) NOT NULL,
	`client` varchar(200) NOT NULL,
	`status` enum('confirmed','hot','cold','archived') NOT NULL DEFAULT 'cold',
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`cadence` enum('weekly','biweekly_odd','biweekly_even') NOT NULL DEFAULT 'weekly',
	`visit_days` json NOT NULL DEFAULT ('[]'),
	`leader_consultant_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_absences_consultant` ON `absences` (`consultant_id`);--> statement-breakpoint
CREATE INDEX `idx_allocations_project` ON `allocations` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_allocations_consultant` ON `allocations` (`consultant_id`);--> statement-breakpoint
CREATE INDEX `idx_consultants_level` ON `consultants` (`level`);--> statement-breakpoint
CREATE INDEX `idx_consultants_is_leader` ON `consultants` (`is_leader`);--> statement-breakpoint
CREATE INDEX `idx_level_slots_project` ON `level_slots` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_pinned_slots_project` ON `pinned_slots` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_projects_status` ON `projects` (`status`);--> statement-breakpoint
CREATE INDEX `idx_projects_dates` ON `projects` (`start_date`,`end_date`);