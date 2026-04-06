ALTER TABLE `properties` ADD `city` varchar(255);--> statement-breakpoint
ALTER TABLE `properties` ADD `state` varchar(2);--> statement-breakpoint
ALTER TABLE `properties` ADD `cep` varchar(10);--> statement-breakpoint
ALTER TABLE `properties` ADD `offerPrice` decimal(12,2);--> statement-breakpoint
ALTER TABLE `properties` ADD `videoUrl` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `plantaBaixaUrl` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `areaConstruida` decimal(10,2);--> statement-breakpoint
ALTER TABLE `properties` ADD `areaCasa` decimal(10,2);--> statement-breakpoint
ALTER TABLE `properties` ADD `areaTerreno` decimal(10,2);--> statement-breakpoint
ALTER TABLE `properties` ADD `bedrooms` int;--> statement-breakpoint
ALTER TABLE `properties` ADD `bathrooms` int;--> statement-breakpoint
ALTER TABLE `properties` ADD `garageSpaces` int;--> statement-breakpoint
ALTER TABLE `properties` ADD `propertyType` varchar(100);--> statement-breakpoint
ALTER TABLE `properties` ADD `publicSlug` varchar(255);