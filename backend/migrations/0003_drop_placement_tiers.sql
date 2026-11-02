-- The placement scale leaves the schema with the column that consumed it:
-- no server code computes what a place is worth any more.
ALTER TABLE "tournaments" DROP COLUMN "placement_tiers";