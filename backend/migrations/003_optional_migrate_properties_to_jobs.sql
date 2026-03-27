BEGIN;

INSERT INTO jobs (id, company_id, name, notes, contact_id, is_active, created_at)
SELECT p.id, p.company_id, p.name, p.notes, p.contact_id, p.is_active, p.created_at
FROM properties p
LEFT JOIN jobs j ON j.id = p.id
WHERE j.id IS NULL;

UPDATE transactions t
SET job_id = t.property_id
WHERE t.property_id IS NOT NULL
  AND t.job_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM jobs j
    WHERE j.id = t.property_id
      AND j.company_id = t.company_id
  );

SELECT setval(
  pg_get_serial_sequence('jobs', 'id'),
  COALESCE((SELECT MAX(id) FROM jobs), 1),
  true
);

COMMIT;
