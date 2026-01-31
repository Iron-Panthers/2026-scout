# Scouting Data Schema Versioning Guide

## Overview

The scouting system uses versioned JSON schemas to track the structure of scouting data over time. This enables safe data migrations when the scouting form structure changes.

## Database Tables

### `scouting_submissions`

Stores submitted scouting data:
- `id` - UUID primary key
- `match_id` - Foreign key to matches table
- `role` - Scout role (red1, red2, red3, qual_red, blue1, blue2, blue3, qual_blue)
- `scouting_data` - JSONB containing the full scouting state
- `schema_version` - Integer tracking which schema version was used (defaults to 1)
- `time` - Submission timestamp
- `scouter_id` - Foreign key to profiles (who submitted)
- `created_at` / `updated_at` - Audit timestamps

### `scouting_schema_versions`

Tracks metadata about each schema version:
- `version` - Integer primary key
- `description` - Human-readable description of changes
- `schema_definition` - JSONB containing schema structure
- `migration_notes` - Notes about migrating from previous version
- `implemented_at` - When this version was created

## Current Schema (Version 1)

```json
{
  "phases": ["auto", "transition-shift", "phase1", "phase2", "phase3", "phase4", "endgame"],
  "structure": {
    "shots": "object with phase keys containing arrays of {x, y, timestamp}",
    "counters": "object with phase keys containing counter objects",
    "comments": "string",
    "errors": "string",
    "defenseDescription": "string",
    "currentPhase": "string"
  }
}
```

## Usage Examples

### Submitting Scouting Data

```typescript
import { submitScoutingData } from '@/lib/scoutingSchema';

// Submit data (automatically uses current schema version)
await submitScoutingData(
  matchId,
  'red1',
  scoutingState,
  user.id
);
```

### Retrieving Match Submissions

```typescript
import { getMatchSubmissions } from '@/lib/scoutingSchema';

// Get submissions with automatic migration to current schema
const submissions = await getMatchSubmissions(matchId);

// Get submissions without migration (preserve original schema)
const rawSubmissions = await getMatchSubmissions(matchId, false);
```

### Retrieving Scout's Submissions

```typescript
import { getScouterSubmissions } from '@/lib/scoutingSchema';

// Get all submissions by a scout
const mySubmissions = await getScouterSubmissions(scouterId);
```

### Updating/Deleting Submissions (Managers Only)

```typescript
import { updateScoutingSubmission, deleteScoutingSubmission } from '@/lib/scoutingSchema';

// Update submission data
await updateScoutingSubmission(submissionId, {
  scouting_data: updatedData
});

// Delete submission
await deleteScoutingSubmission(submissionId);
```

## When to Increment Schema Version

Increment `CURRENT_SCHEMA_VERSION` in `src/lib/scoutingSchema.ts` when you make **breaking changes** to the scouting data structure:

- ✅ Adding new counter types
- ✅ Renaming fields in the scouting state
- ✅ Changing data types (string to number, etc.)
- ✅ Restructuring how data is organized
- ✅ Removing fields

Do NOT increment for:
- ❌ Adding new optional fields (backwards compatible)
- ❌ UI-only changes that don't affect data structure
- ❌ Bug fixes that don't change schema

## Adding a New Schema Version

### Step 1: Update the constant

```typescript
// src/lib/scoutingSchema.ts
export const CURRENT_SCHEMA_VERSION = 2; // Increment
```

### Step 2: Add migration function

```typescript
// In applyMigration() function
case 2:
  return migrateV1ToV2(data);

// Add migration implementation
function migrateV1ToV2(data: Record<string, any>): Record<string, any> {
  // Example: rename field
  return {
    ...data,
    shotData: data.shots, // Rename shots to shotData
    shots: undefined, // Remove old field
  };
}
```

### Step 3: Register in database

```typescript
// Run SQL migration or use Supabase dashboard
INSERT INTO public.scouting_schema_versions (version, description, schema_definition, migration_notes)
VALUES (
  2,
  'Renamed shots field to shotData for clarity',
  '{"changes": ["shots -> shotData"]}',
  'Simple field rename, data structure unchanged'
);
```

### Step 4: Test migration

```typescript
import { migrateScoutingData } from '@/lib/scoutingSchema';

// Test migration
const oldData = { shots: [...], counters: {...} };
const newData = migrateScoutingData(oldData, 1, 2);
console.log(newData); // Should have shotData instead of shots
```

## Migration Best Practices

1. **Always test migrations** on sample data before deploying
2. **Keep migrations idempotent** - running twice should be safe
3. **Document breaking changes** in migration_notes
4. **Never skip versions** - migrations run sequentially (1→2→3)
5. **Consider data loss** - warn users if migration loses information
6. **Add validation** - verify migrated data structure is correct

## Querying by Schema Version

```sql
-- Find submissions using old schema
SELECT * FROM scouting_submissions
WHERE schema_version < 2;

-- Count submissions per schema version
SELECT schema_version, COUNT(*)
FROM scouting_submissions
GROUP BY schema_version;
```

## Rollback Strategy

If a new schema version causes issues:

1. Revert `CURRENT_SCHEMA_VERSION` to previous value
2. Deploy hotfix
3. Fix migration logic
4. Re-increment version when ready
5. Consider cleaning up failed submissions if necessary

## Example: Complete Migration Workflow

```typescript
// 1. Increment version
export const CURRENT_SCHEMA_VERSION = 2;

// 2. Add migration case
case 2:
  return migrateV1ToV2(data);

// 3. Implement migration
function migrateV1ToV2(data: any) {
  // Add new required field with default
  return {
    ...data,
    robotPosition: data.robotPosition || { x: 0, y: 0 },
  };
}

// 4. Update schema_versions table
INSERT INTO scouting_schema_versions (version, description, schema_definition)
VALUES (2, 'Added robot position tracking', '{"new_fields": ["robotPosition"]}');

// 5. Test
const old = { shots: [], counters: {} };
const migrated = migrateScoutingData(old, 1, 2);
assert(migrated.robotPosition !== undefined);
```

## RLS Policies

- **Scouts** can insert their own submissions
- **All authenticated users** can view all submissions
- **Managers/Admins** can update and delete any submission
- **Managers/Admins** can manage schema_versions table

## Future Enhancements

Consider adding:
- Automatic background migration job for old submissions
- Schema validation using JSON Schema or Zod
- Migration dry-run/preview mode
- Rollback mechanism for failed migrations
- Migration progress tracking for bulk updates
