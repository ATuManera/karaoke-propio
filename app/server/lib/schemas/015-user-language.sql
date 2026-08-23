-- Up
-- Karaoke Propio: the language a singer has chosen to be spoken to in.
--
-- Nullable on purpose, and the null means something: "nothing chosen, follow
-- the phone". Only a value here overrides the browser, which is exactly the
-- rule the app promises — pick a language in your account and it travels with
-- you to any phone you sign in from; leave it alone and each device decides
-- for itself.
--
-- Stored as a BCP-47 tag ('en', 'es') rather than an id into a table of
-- languages: the list of languages this build speaks is a property of the
-- code that ships with the message files, not data an admin edits, and a row
-- naming a language nobody translated would be a promise the app cannot keep.
-- An unknown or since-removed tag is simply not matched, and that singer
-- falls back to their browser.
ALTER TABLE users ADD COLUMN "locale" text;

-- Down
ALTER TABLE users DROP COLUMN "locale";
