-- A place's worth is no longer STORED: standings are the place and how far the
-- player got. (The tournament's placement tiers stay as configuration.)
ALTER TABLE "tournament_standings" DROP COLUMN "placement_points";