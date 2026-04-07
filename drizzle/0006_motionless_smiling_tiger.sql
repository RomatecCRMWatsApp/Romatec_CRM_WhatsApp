CREATE TABLE `schedulerState` (
	`id` int AUTO_INCREMENT NOT NULL,
	`status` enum('stopped','running','paused') NOT NULL DEFAULT 'stopped',
	`currentPairIndex` int NOT NULL DEFAULT 0,
	`cycleNumber` int NOT NULL DEFAULT 0,
	`messagesThisCycle` int NOT NULL DEFAULT 0,
	`startedAt` timestamp,
	`cycleStartedAt` timestamp,
	`stateJson` json,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedulerState_id` PRIMARY KEY(`id`)
);
