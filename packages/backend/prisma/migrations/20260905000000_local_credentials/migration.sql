-- Replace Clerk-hosted identity with owner-issued local credentials.
--
-- Login moves from email to an owner-assigned username: factory staff do not
-- reliably have work email addresses, so email becomes optional contact
-- detail rather than the credential.
--
-- Written to be safe on a database that already has app_user rows as well as
-- on a fresh one. Existing rows get a username derived from their email and a
-- deliberately unusable password hash ('!'), which no scrypt verification can
-- ever match — those users must be re-issued a password by the owner.

ALTER TABLE "app_user" ADD COLUMN "username" TEXT;
ALTER TABLE "app_user" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "app_user" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- email was the login identifier and therefore NOT NULL. It is now optional.
ALTER TABLE "app_user" ALTER COLUMN "email" DROP NOT NULL;

-- Backfill any pre-existing rows before the NOT NULL constraints go on.
UPDATE "app_user" SET "username" = split_part("email", '@', 1) WHERE "username" IS NULL AND "email" IS NOT NULL;
UPDATE "app_user" SET "username" = 'user_' || left("id", 8) WHERE "username" IS NULL;
UPDATE "app_user" SET "password_hash" = '!' WHERE "password_hash" IS NULL;

ALTER TABLE "app_user" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "app_user" ALTER COLUMN "password_hash" SET NOT NULL;

CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");
