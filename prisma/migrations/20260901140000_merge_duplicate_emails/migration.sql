SET lock_timeout = '5s';

CREATE EXTENSION IF NOT EXISTS citext;

DO $$
DECLARE
  mailbox record;
  duplicate record;
  reference record;
  still_referencing bigint;
BEGIN
  FOR mailbox IN
    SELECT lower(email) AS folded,
           (array_agg(id ORDER BY created_at, id))[1] AS keep_id
    FROM users
    GROUP BY 1
    HAVING count(*) > 1
  LOOP
    FOR duplicate IN
      SELECT id, arranger_id
      FROM users
      WHERE lower(email) = mailbox.folded AND id <> mailbox.keep_id
    LOOP
      UPDATE provider_users AS moved
      SET id = mailbox.keep_id
      WHERE moved.id = duplicate.id
        AND NOT EXISTS (
          SELECT 1 FROM provider_users AS kept
          WHERE kept.id = mailbox.keep_id AND kept.provider = moved.provider
        );
      DELETE FROM provider_users WHERE id = duplicate.id;

      UPDATE registrations AS moved
      SET user_id = mailbox.keep_id
      WHERE moved.user_id = duplicate.id
        AND NOT EXISTS (
          SELECT 1 FROM registrations AS kept
          WHERE kept.user_id = mailbox.keep_id AND kept.event_id = moved.event_id
        );
      DELETE FROM registrations WHERE user_id = duplicate.id;

      UPDATE arranger_follower AS moved
      SET user_id = mailbox.keep_id
      WHERE moved.user_id = duplicate.id
        AND NOT EXISTS (
          SELECT 1 FROM arranger_follower AS kept
          WHERE kept.user_id = mailbox.keep_id AND kept.arranger_id = moved.arranger_id
        );
      DELETE FROM arranger_follower WHERE user_id = duplicate.id;

      UPDATE user_seen_updates AS moved
      SET user_id = mailbox.keep_id
      WHERE moved.user_id = duplicate.id
        AND NOT EXISTS (
          SELECT 1 FROM user_seen_updates AS kept
          WHERE kept.user_id = mailbox.keep_id AND kept.update = moved.update
        );
      DELETE FROM user_seen_updates WHERE user_id = duplicate.id;

      FOR reference IN
        SELECT tc.table_name AS referencing_table,
               kcu.column_name AS referencing_column,
               ccu.table_name AS referenced_table
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.column_name = 'id'
          AND ccu.table_name IN ('users', 'arrangers')
          AND tc.table_name <> 'users'
      LOOP
        EXECUTE format(
          'SELECT count(*) FROM %I WHERE %I = $1',
          reference.referencing_table,
          reference.referencing_column
        )
        INTO still_referencing
        USING (
          CASE WHEN reference.referenced_table = 'users'
            THEN duplicate.id
            ELSE duplicate.arranger_id
          END
        );

        IF still_referencing > 0 THEN
          RAISE EXCEPTION
            'Refusing to merge account %: % rows still reference it through %.%',
            duplicate.id, still_referencing,
            reference.referencing_table, reference.referencing_column;
        END IF;
      END LOOP;

      DELETE FROM users WHERE id = duplicate.id;
      DELETE FROM arrangers WHERE id = duplicate.arranger_id;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE "users" ALTER COLUMN "email" TYPE CITEXT;
