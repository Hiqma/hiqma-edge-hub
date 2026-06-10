-- Fix duplicate records in local_activity table for edge hub
-- This script removes duplicates before creating the unique index

-- Step 1: Identify and remove duplicates, keeping the one with studentId if available, 
-- otherwise the one with moduleCompleted=true, otherwise the oldest one

WITH duplicates AS (
  SELECT 
    id,
    "sessionId",
    "contentId",
    "timeSpent",
    "studentId",
    "moduleCompleted",
    timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY "sessionId", "contentId", "timeSpent"
      ORDER BY 
        CASE WHEN "studentId" IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN "moduleCompleted" = true THEN 0 ELSE 1 END,
        timestamp ASC
    ) as rn
  FROM local_activity
)
DELETE FROM local_activity
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 2: Show summary of what was cleaned
SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT ("sessionId", "contentId", "timeSpent")) as unique_combinations
FROM local_activity;
