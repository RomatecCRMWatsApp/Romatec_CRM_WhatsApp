CREATE TABLE `campaignSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`hourCycle` int NOT NULL DEFAULT 0,
	`campaign1Id` int NOT NULL,
	`campaign2Id` int NOT NULL,
	`message1SentAt` timestamp,
	`message2SentAt` timestamp,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaignSchedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contactCampaignHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`campaignId` int NOT NULL,
	`lastCampaignId` int,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contactCampaignHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dailyReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(10) NOT NULL,
	`totalSent` int NOT NULL DEFAULT 0,
	`totalFailed` int NOT NULL DEFAULT 0,
	`totalBlocked` int NOT NULL DEFAULT 0,
	`executionTime` int NOT NULL DEFAULT 0,
	`successRate` decimal(5,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dailyReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messageVariations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`messageText` text NOT NULL,
	`messageOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `messageVariations_id` PRIMARY KEY(`id`)
);
