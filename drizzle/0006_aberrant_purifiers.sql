ALTER TABLE `spare_part_requests` ADD `unit_price` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `spare_part_requests` ADD `installed_by` text;--> statement-breakpoint
ALTER TABLE `spare_part_requests` ADD `installed_at` text;--> statement-breakpoint
UPDATE `orders` SET `status`='Menunggu APAR' WHERE `kind`='Refill' AND `status`='Menunggu harga';--> statement-breakpoint
UPDATE `orders` SET `status`='APAR masuk' WHERE `kind`='Refill' AND `status` IN ('Disetujui','Di workshop');--> statement-breakpoint
UPDATE `orders` SET `status`='Sedang diproses' WHERE `kind`='Refill' AND `status` IN ('Dikerjakan','Menunggu QC');--> statement-breakpoint
UPDATE `orders` SET `status`='Proses selesai' WHERE `kind`='Refill' AND `status`='Selesai';--> statement-breakpoint
UPDATE `spare_part_requests` SET `status`='Menunggu pemilik' WHERE `status`='Menunggu';--> statement-breakpoint
UPDATE `spare_part_requests` SET `status`='Terpasang' WHERE `status`='Disetujui';
