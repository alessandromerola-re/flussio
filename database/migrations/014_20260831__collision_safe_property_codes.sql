CREATE OR REPLACE FUNCTION assign_property_external_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  base_code TEXT;
  candidate_code TEXT;
  suffix INTEGER;
BEGIN
  IF NEW.external_id IS NULL OR BTRIM(NEW.external_id) = '' THEN
    base_code := 'IMM-' || LPAD(
      NEW.id::text,
      GREATEST(6, LENGTH(NEW.id::text)),
      '0'
    );
    candidate_code := base_code;
    suffix := 0;

    WHILE EXISTS (
      SELECT 1
      FROM properties
      WHERE company_id = NEW.company_id
        AND external_id = candidate_code
    ) LOOP
      suffix := suffix + 1;
      candidate_code := base_code || '-' || suffix::text;
    END LOOP;

    NEW.external_id := candidate_code;
  END IF;
  RETURN NEW;
END;
$$;
