ALTER TABLE "pet_photos"
  ADD COLUMN "medium_url" TEXT,
  ADD COLUMN "medium_path" TEXT,
  ADD COLUMN "thumbnail_url" TEXT,
  ADD COLUMN "thumbnail_path" TEXT,
  ADD COLUMN "mime_type" TEXT,
  ADD COLUMN "size" INTEGER,
  ADD COLUMN "original_size" INTEGER,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "thumbnail_size" INTEGER;

ALTER TABLE "product_images"
  ADD COLUMN "medium_url" TEXT,
  ADD COLUMN "medium_path" TEXT,
  ADD COLUMN "thumbnail_url" TEXT,
  ADD COLUMN "thumbnail_path" TEXT,
  ADD COLUMN "mime_type" TEXT,
  ADD COLUMN "size" INTEGER,
  ADD COLUMN "original_size" INTEGER,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "thumbnail_size" INTEGER;

ALTER TABLE "expense_files"
  ADD COLUMN "original_size" INTEGER,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER;

CREATE INDEX "pet_photos_pet_id_created_at_idx"
  ON "pet_photos"("pet_id", "created_at");

CREATE INDEX "product_images_product_id_created_at_idx"
  ON "product_images"("product_id", "created_at");
