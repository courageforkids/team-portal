-- Start the first Courage Academy season (Winter Season) right away, if no season exists yet.
INSERT INTO "cape_seasons" ("name", "starts_on", "ends_on", "theme")
SELECT 'Winter Season', (now() AT TIME ZONE 'America/New_York')::date, DATE '2027-01-01', 'winter'
WHERE NOT EXISTS (SELECT 1 FROM "cape_seasons");
