BEGIN;

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS original_name TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS size INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS storage_path TEXT;

UPDATE attachments
SET original_name = COALESCE(original_name, file_name),
    storage_path = COALESCE(storage_path, path)
WHERE original_name IS NULL OR storage_path IS NULL;

ALTER TABLE attachments
  ALTER COLUMN original_name SET NOT NULL,
  ALTER COLUMN storage_path SET NOT NULL;

COMMIT;
