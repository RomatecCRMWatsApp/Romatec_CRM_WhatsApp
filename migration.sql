CREATE TABLE `contacts` (
`id` int AUTO_INCREMENT NOT NULL,
`name` varchar(255) NOT NULL,
`phone` varchar(20) NOT NULL,
`email` varchar(255),
`status` enum('active','blocked','inactive') NOT NULL DEFAULT 'active',
`blockedUntil` timestamp,
`createdAt` timestamp NOT NULL DEFAULT (now()),
`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
CONSTRAINT `contacts_id` PRIMARY KEY(`id`),
CONSTRAINT `contacts_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE `properties` (
`id` int AUTO_INCREMENT NOT NULL,
`denomination` varchar(255) NOT NULL,
`address` text NOT NULL,
`price` decimal(12,2) NOT NULL,
`description` text,
`images` json,
`status` enum('available','sold','inactive') NOT NULL DEFAULT 'available',
`createdAt` timestamp NOT NULL DEFAULT (now()),
`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
CONSTRAINT `properties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
`id` int AUTO_INCREMENT NOT NULL,
`propertyId` int NOT NULL,
`name` varchar(255) NOT NULL,
`status` enum('draft','scheduled','running','paused','completed') NOT NULL DEFAULT 'draft',
`messageVariations` json,
`totalContacts` int DEFAULT 12,
`sentCount` int DEFAULT 0,
`failedCount` int DEFAULT 0,
`startDate` timestamp,
`endDate` timestamp,
`createdAt` timestamp NOT NULL DEFAULT (now()),
`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaignContacts` (
`id` int AUTO_INCREMENT NOT NULL,
`campaignId` int NOT NULL,
`contactId` int NOT NULL,
`messagesSent` int DEFAULT 0,
`lastMessageSent` timestamp,
`status` enum('pending','sent','failed','blocked') NOT NULL DEFAULT 'pending',
`createdAt` timestamp NOT NULL DEFAULT (now()),
`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
CONSTRAINT `campaignContacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
`id` int AUTO_INCREMENT NOT NULL,
`campaignId` int NOT NULL,
`contactId` int NOT NULL,
`propertyId` int NOT NULL,
`messageText` text NOT NULL,
`status` enum('pending','sent','delivered','failed','blocked') NOT NULL DEFAULT 'pending',
`zApiMessageId` varchar(255),
`sentAt` timestamp,
`deliveredAt` timestamp,
`errorMessage` text,
`createdAt` timestamp NOT NULL DEFAULT (now()),
`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companyConfig` (
`id` int AUTO_INCREMENT NOT NULL,
`companyName` varchar(255) NOT NULL,
`phone` varchar(20) NOT NULL,
`address` text,
`zApiInstanceId` varchar(255),
`zApiToken` varchar(255),
`zApiConnected` boolean DEFAULT false,
`zApiLastChecked` timestamp,
`createdAt` timestamp NOT NULL DEFAULT (now()),
`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
CONSTRAINT `companyConfig_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interactions` (
`id` int AUTO_INCREMENT NOT NULL,
`messageId` int NOT NULL,
`contactId` int NOT NULL,
`campaignId` int NOT NULL,
`responseText` text,
`sentiment` enum('positive','negative','neutral','unknown') DEFAULT 'unknown',
`responseTime` int,
`createdAt` timestamp NOT NULL DEFAULT (now()),
`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
CONSTRAINT `interactions_id` PRIMARY KEY(`id`)
);

-- Inserir configuração da empresa
INSERT INTO companyConfig (companyName, phone, address, zApiInstanceId, zApiToken, zApiConnected) VALUES
('Romatec Consultoria Total', '(99) 9181-1246', 'Rua São Raimundo, 10 - Centro, Açailândia - MA', '', '', false);


-- Inserir 4 imóveis
INSERT INTO properties (denomination, address, price, description, status) VALUES
('ALACIDE', 'AV-Tocantins, Quadra 38 Lote 01', 380000.00, 'Lote comercial em localização privilegiada', 'available'),
('Mod_Vaz-01', 'Rua João Mariquinha, Quadra 15 Lote 12', 300000.00, 'Módulo residencial completo', 'available'),
('Mod_Vaz-02', 'Rua Amaro Pedroza, Quadra 17 Lote 010', 250000.00, 'Módulo residencial em condomínio', 'available'),
('Mod_Vaz-03', 'Rua Salomão Awad, Quadra 11 Lote 10E', 210000.00, 'Módulo residencial 60m² com projeto', 'available');

