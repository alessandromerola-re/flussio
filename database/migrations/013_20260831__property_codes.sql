UPDATE properties p
SET external_id = CASE
  WHEN EXISTS (
    SELECT 1
    FROM properties existing
    WHERE existing.company_id = p.company_id
      AND existing.id <> p.id
      AND existing.external_id = 'IMM-' || LPAD(p.id::text, GREATEST(6, LENGTH(p.id::text)), '0')
  )
    THEN 'IMM-AUTO-' || p.company_id::text || '-' || p.id::text
  ELSE 'IMM-' || LPAD(p.id::text, GREATEST(6, LENGTH(p.id::text)), '0')
END
WHERE external_id IS NULL OR BTRIM(external_id) = '';

CREATE OR REPLACE FUNCTION assign_property_external_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  generated_code TEXT;
BEGIN
  IF NEW.external_id IS NULL OR BTRIM(NEW.external_id) = '' THEN
    generated_code := 'IMM-' || LPAD(NEW.id::text, GREATEST(6, LENGTH(NEW.id::text)), '0');
    IF EXISTS (
      SELECT 1 FROM properties
      WHERE company_id = NEW.company_id AND external_id = generated_code
    ) THEN
      generated_code := 'IMM-AUTO-' || NEW.company_id::text || '-' || NEW.id::text;
    END IF;
    NEW.external_id := generated_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_properties_external_id ON properties;
CREATE TRIGGER trg_properties_external_id
BEFORE INSERT ON properties
FOR EACH ROW
EXECUTE FUNCTION assign_property_external_id();

ALTER TABLE properties
  ALTER COLUMN external_id SET NOT NULL;
