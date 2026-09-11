-- Adds attempt tracking to password_resets so a code can be locked out after
-- too many wrong guesses, the same way users.failed_attempts already locks
-- out a wrong PIN on login. Without this, a 6-digit reset code (about
-- 900,000 possible values) could be guessed with unlimited attempts for its
-- full 15-minute validity window.
ALTER TABLE password_resets ADD COLUMN attempts INT NOT NULL DEFAULT 0;
