ALTER TABLE matches ADD COLUMN actual_home_score INTEGER;
ALTER TABLE matches ADD COLUMN actual_away_score INTEGER;
ALTER TABLE predictions ADD COLUMN predicted_home_score INTEGER;
ALTER TABLE predictions ADD COLUMN predicted_away_score INTEGER;
