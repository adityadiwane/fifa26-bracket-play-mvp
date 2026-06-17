-- Add bonus_points column to users table
ALTER TABLE users ADD COLUMN bonus_points REAL NOT NULL DEFAULT 0;

-- Grant 8 bonus points to existing users who have fewer than 6 predictions
UPDATE users
   SET bonus_points = 8
 WHERE id IN (
   SELECT u.id
     FROM users u
     LEFT JOIN predictions p ON p.user_id = u.id AND p.league_id = u.league_id
    GROUP BY u.id
   HAVING COUNT(p.id) < 6
 );
