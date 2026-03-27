BEGIN;

UPDATE users
SET password_hash = '$2a$10$VLjcBGe17jXHE4u5YHpkDOOgnoMvZLElu4HGAg42zAiFOsUM6/EMK'
WHERE email = 'dev@flussio.local'
  AND password_hash = 'flussio123';

COMMIT;
