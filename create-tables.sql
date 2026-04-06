CREATE TABLE IF NOT EXISTS `companyConfig` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `companyName` varchar(255) NOT NULL DEFAULT 'Romatec Consultoria Imobiliária',
  `phone` varchar(20) NOT NULL DEFAULT '(99) 999169-0178',
  `address` varchar(255) NOT NULL DEFAULT 'Rua São Raimundo, 10 - Centro, Açailândia - MA',
  `zApiInstanceId` varchar(255),
  `zApiToken` varchar(255),
  `zApiConnected` boolean DEFAULT false,
  `zApiLastChecked` datetime,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `contacts` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(255),
  `phone` varchar(20),
  `email` varchar(255),
  `status` varchar(50) DEFAULT 'active',
  `blockedUntil` datetime,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `properties` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `denomination` varchar(255),
  `address` varchar(255),
  `price` decimal(12,2),
  `description` text,
  `images` json,
  `status` varchar(50) DEFAULT 'available',
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `campaigns` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `propertyId` int,
  `name` varchar(255),
  `status` varchar(50) DEFAULT 'draft',
  `messageVariations` json,
  `totalContacts` int DEFAULT 0,
  `sentCount` int DEFAULT 0,
  `failedCount` int DEFAULT 0,
  `startDate` datetime,
  `endDate` datetime,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`)
);

INSERT INTO `companyConfig` (`companyName`, `phone`, `address`, `zApiInstanceId`, `zApiToken`) 
VALUES ('Romatec Consultoria Imobiliária', '(99) 999169-0178', 'Rua São Raimundo, 10 - Centro, Açailândia - MA', '3F0D313A38C952B7106F6A1199C38405', '')
ON DUPLICATE KEY UPDATE `id`=`id`;
