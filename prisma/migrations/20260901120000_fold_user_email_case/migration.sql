SET lock_timeout = '5s';

CREATE EXTENSION IF NOT EXISTS citext;

DO $$
DECLARE
  collisions integer;
BEGIN
  SELECT count(*) INTO collisions
  FROM (
    SELECT lower(email) FROM "users" GROUP BY 1 HAVING count(*) > 1
  ) AS folded;

  IF collisions > 0 THEN
    RAISE EXCEPTION
      'Cannot fold email case: % mailboxes hold more than one account. Merge them before deploying.',
      collisions;
  END IF;
END $$;

ALTER TABLE "users" ALTER COLUMN "email" TYPE CITEXT;
