-- Add optional facility brand accent color for subtle UI theming.
ALTER TABLE "Facility"
ADD COLUMN "brandColor" TEXT;
