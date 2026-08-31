DO $$
DECLARE
  property_row RECORD;
  base_code TEXT;
  candidate_code TEXT;
  suffix INTEGER;
BEGIN
  FOR property_row IN
    SELECT id, company_id
    FROM properties
    WHERE external_id IS NULL OR BTRIM(external_id) = ''
    ORDER BY id
  LOOP
    base_code := 'IMM-' || LPAD(
      property_row.id::text,
      GREATEST(6, LENGTH(property_row.id::text)),
      '0'
    );
    candidate_code := base_code;
    suffix := 0;

    WHILE EXISTS (
      SELECT 1
      FROM properties
      WHERE company_id = property_row.company_id
        AND id <> property_row.id
        AND external_id = candidate_code
    ) LOOP
      suffix := suffix + 1;
      candidate_code := base_code || '-' || suffix::text;
    END LOOP;

    UPDATE properties
    SET external_id = candidate_code
    WHERE id = property_row.id;
  END LOOP;
END;
$$;
