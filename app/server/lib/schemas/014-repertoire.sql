-- Up
-- Karaoke Propio: whether a singer may bring their repertoire from another
-- installation and apply it to their own account.
--
-- On by default, because the feature is only reachable by someone who is
-- already in a room here — the host let them in — and what it writes is
-- confined to that person's own saved pitches and stars. An admin who would
-- rather nobody did it turns it off, and the import routes refuse for
-- everyone except an admin acting deliberately.
INSERT OR IGNORE INTO prefs (key, data) VALUES ('isRepertoireImportEnabled', 'true');

-- Down
DELETE FROM prefs WHERE key = 'isRepertoireImportEnabled';
