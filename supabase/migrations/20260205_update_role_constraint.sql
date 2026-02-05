-- Update the role check constraint to include qualRed and qualBlue roles
-- First, drop the existing constraint
ALTER TABLE scouting_submissions 
DROP CONSTRAINT IF EXISTS scouting_submissions_role_check;

-- Add the updated constraint with all valid roles
ALTER TABLE scouting_submissions
ADD CONSTRAINT scouting_submissions_role_check 
CHECK (role IN ('red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3', 'qualRed', 'qualBlue'));
