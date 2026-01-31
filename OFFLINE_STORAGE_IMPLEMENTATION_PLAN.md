# Offline Storage Implementation Plan

## Overview
Implement a local storage system to save match scouting data as a failsafe when internet is unavailable. Enable users to upload stored matches to the database when connectivity is restored.

## Architecture Design

### Local Storage Structure
```typescript
// Key: `offline_matches`
{
  [uniqueKey: string]: {
    // Identifiers
    matchId?: string;          // From database (if available)
    eventCode: string;         // From match or event
    matchNumber: number;       // Match number
    role: string;              // Scout role (red1, blue1, etc.)

    // Metadata
    timestamp: number;         // When saved to local storage
    uploaded: boolean;         // Whether uploaded to database
    uploadedAt?: number;       // When uploaded

    // Data
    scoutingData: any;         // Full scouting data JSON
    scouterId?: string;        // Who scouted it
  }
}
```

### Unique Key Strategy
Use: `${eventCode}_${matchNumber}_${role}_${timestamp}`
- Handles missing match_id (offline scenarios)
- Prevents duplicates from same event/match/role
- Timestamp ensures uniqueness for rescouts

---

## Phase 1: Local Storage Service

### 1.1 Create Local Storage Manager
**File:** `src/lib/offlineStorage.ts`

- [ ] Create interface `OfflineMatchData`
- [ ] Create interface `OfflineMatchStorage` (map structure)
- [ ] Implement `saveOfflineMatch()` - Save match to local storage
- [ ] Implement `getOfflineMatches()` - Retrieve all offline matches
- [ ] Implement `getOfflineMatch(key)` - Get single match
- [ ] Implement `markAsUploaded(key)` - Mark match as uploaded
- [ ] Implement `deleteOfflineMatch(key)` - Remove from storage
- [ ] Implement `clearUploadedMatches()` - Clean up uploaded matches
- [ ] Add error handling for localStorage quota exceeded
- [ ] Add JSON serialization safety (try/catch)

**QA Checks:**
- [ ] Handles corrupted localStorage data gracefully
- [ ] Works with localStorage disabled/unavailable
- [ ] Handles quota exceeded scenarios
- [ ] Validates data structure before saving
- [ ] Returns typed data (TypeScript)

---

## Phase 2: Review Page Integration

### 2.1 Auto-Save on Review Page Load
**File:** `src/pages/ScoutingReview.tsx`

- [ ] Import `saveOfflineMatch()` from offlineStorage
- [ ] Extract event code from decoded data
- [ ] Save to local storage on component mount (useEffect)
- [ ] Include all required fields (eventCode, matchNumber, role, scoutingData)
- [ ] Add scouter_id from auth context
- [ ] Set uploaded: false initially
- [ ] Show toast notification: "Match saved offline"
- [ ] Handle save errors gracefully

**QA Checks:**
- [ ] Saves immediately when review page loads
- [ ] Doesn't interfere with normal submission flow
- [ ] Works with and without match_id
- [ ] Includes complete scouting data
- [ ] User receives feedback that save occurred

### 2.2 Mark as Uploaded on Successful Submission
**File:** `src/pages/ScoutingReview.tsx`

- [ ] After successful `submitScoutingData()` call
- [ ] Generate the same unique key used for saving
- [ ] Call `markAsUploaded(key)` with timestamp
- [ ] Handle case where offline match doesn't exist (user may have cleared storage)
- [ ] Don't block submission if marking fails

**QA Checks:**
- [ ] Marks correct match as uploaded
- [ ] Handles missing offline match gracefully
- [ ] Doesn't break existing submission flow
- [ ] Updates uploadedAt timestamp

---

## Phase 3: Dashboard Offline Section

### 3.1 Create Offline Matches Component
**File:** `src/components/OfflineMatches.tsx`

- [ ] Create component to display offline matches list
- [ ] Import `getOfflineMatches()` from offlineStorage
- [ ] Load matches on mount
- [ ] Group by uploaded status (pending vs uploaded)
- [ ] Display match details (event, match #, role, timestamp)
- [ ] Show upload status indicator (badge/icon)
- [ ] Add "Upload" button for non-uploaded matches
- [ ] Add "Delete" button for uploaded matches (cleanup)
- [ ] Add "Upload All" button for batch upload
- [ ] Show empty state when no offline matches
- [ ] Style with existing UI components (Card, Button, Badge)

**QA Checks:**
- [ ] Displays all offline matches correctly
- [ ] Clear visual distinction between uploaded/not uploaded
- [ ] Responsive design
- [ ] Accessible (keyboard navigation, screen readers)
- [ ] Handles empty state gracefully

### 3.2 Database Verification Logic
**File:** `src/components/OfflineMatches.tsx` or helper in `src/lib/offlineStorage.ts`

- [ ] Create function to check if match exists in database
- [ ] Query `scouting_submissions` table by match_id, role, scouter_id
- [ ] Handle matches without match_id (query by event_id + match_number + role)
- [ ] Return boolean indicating database presence
- [ ] Cache results to avoid repeated queries
- [ ] Handle query errors (assume not uploaded)

**QA Checks:**
- [ ] Accurately detects uploaded matches
- [ ] Works with and without match_id
- [ ] Handles database errors gracefully
- [ ] Doesn't cause excessive queries (caching)
- [ ] Updates UI when verification completes

### 3.3 Upload Functionality
**File:** `src/components/OfflineMatches.tsx`

- [ ] Import `submitScoutingData()` from scoutingSchema
- [ ] Create upload handler for single match
- [ ] Resolve match_id if missing (using event_id + match_number)
- [ ] Call `submitScoutingData()` with offline match data
- [ ] Mark as uploaded on success
- [ ] Show success toast notification
- [ ] Show error toast on failure
- [ ] Handle validation errors (missing required fields)
- [ ] Implement "Upload All" to batch upload pending matches
- [ ] Update UI after each upload (refetch offline matches)
- [ ] Add loading states during upload

**QA Checks:**
- [ ] Successfully uploads match data to database
- [ ] Resolves match_id when missing
- [ ] Handles submission errors gracefully
- [ ] Shows clear user feedback (loading, success, error)
- [ ] Updates local storage uploaded status
- [ ] Batch upload works correctly
- [ ] Doesn't re-upload already uploaded matches

### 3.4 Integrate into Dashboard
**File:** `src/pages/Dashboard.tsx`

- [ ] Import `OfflineMatches` component
- [ ] Add new section "Offline Matches" or "Pending Uploads"
- [ ] Position above or below assigned matches section
- [ ] Add collapsible accordion if space-limited
- [ ] Show count badge with number of pending uploads
- [ ] Style consistently with existing dashboard design

**QA Checks:**
- [ ] Visible and accessible in dashboard
- [ ] Doesn't interfere with existing functionality
- [ ] Responsive layout
- [ ] Clear section labeling

---

## Phase 4: Edge Cases & Polish

### 4.1 Handle Missing match_id Resolution
**File:** `src/lib/offlineStorage.ts` or helper function

- [ ] Create function to resolve match_id from event_id + match_number
- [ ] Query `matches` table using event_id and match_number
- [ ] Return match_id or null
- [ ] Use in upload flow when match_id is missing
- [ ] Cache resolved match_ids

**QA Checks:**
- [ ] Successfully resolves match_id
- [ ] Handles non-existent matches
- [ ] Works offline (returns null gracefully)
- [ ] Doesn't block upload if resolution fails

### 4.2 Duplicate Detection
**File:** `src/lib/offlineStorage.ts`

- [ ] Before saving, check if similar match already exists
- [ ] Compare by event + match number + role
- [ ] Warn user if duplicate found (optional: allow override)
- [ ] Use timestamp to distinguish rescouts

**QA Checks:**
- [ ] Detects true duplicates
- [ ] Allows legitimate rescouts
- [ ] User has control over duplicates

### 4.3 Storage Quota Management
**File:** `src/lib/offlineStorage.ts`

- [ ] Monitor localStorage size
- [ ] Implement automatic cleanup of old uploaded matches (e.g., >7 days)
- [ ] Warn user when approaching quota limit
- [ ] Provide manual "Clear Uploaded Matches" option

**QA Checks:**
- [ ] Doesn't lose critical data
- [ ] Warns before running out of space
- [ ] Cleanup works correctly
- [ ] User can manually manage storage

### 4.4 Data Migration & Schema Versioning
**File:** `src/lib/offlineStorage.ts`

- [ ] Add schema version to offline storage structure
- [ ] Match schema versioning from `scoutingSchema.ts`
- [ ] Handle schema migrations for offline data
- [ ] Validate data on load (check schema version)

**QA Checks:**
- [ ] Compatible with existing schema versioning
- [ ] Handles version mismatches
- [ ] Doesn't break on schema updates

### 4.5 Network Status Awareness
**File:** `src/components/OfflineMatches.tsx` or `src/hooks/useNetworkStatus.ts`

- [ ] Create hook to detect online/offline status
- [ ] Show indicator in offline matches section
- [ ] Disable upload when offline
- [ ] Auto-upload when coming back online (optional)
- [ ] Show appropriate messaging

**QA Checks:**
- [ ] Accurately detects network status
- [ ] Provides clear user feedback
- [ ] Doesn't attempt upload when offline
- [ ] Handles rapid online/offline transitions

---

## Phase 5: Testing & Documentation

### 5.1 Manual Testing Scenarios

- [ ] **Basic Flow:** Scout match → Review → Auto-save → Upload from dashboard
- [ ] **Offline Scouting:** Disable network → Scout → Review → Enable network → Upload
- [ ] **Missing match_id:** Scout without match_id → Save → Upload (resolve match_id)
- [ ] **Duplicate Handling:** Scout same match twice → Check duplicate detection
- [ ] **Batch Upload:** Save multiple matches → Upload all at once
- [ ] **Storage Quota:** Fill localStorage → Verify quota management
- [ ] **Data Integrity:** Verify uploaded data matches original scouting data
- [ ] **Error Recovery:** Force submission failure → Retry upload
- [ ] **Schema Version:** Verify schema version consistency

### 5.2 Edge Case Testing

- [ ] Browser with localStorage disabled
- [ ] Corrupted localStorage data
- [ ] Multiple scouts uploading same match
- [ ] Very large scouting data (many shots)
- [ ] Browser cache cleared while scouting
- [ ] Rapid upload button clicks (race conditions)
- [ ] Database offline during upload attempt

### 5.3 Documentation

- [ ] Update CLAUDE.md with offline storage system
- [ ] Add comments to all new functions
- [ ] Document localStorage key structure
- [ ] Add user-facing documentation (how to use offline mode)
- [ ] Update architecture diagram (if exists)

**QA Checks:**
- [ ] Code is well-commented
- [ ] User documentation is clear
- [ ] Architecture changes documented

---

## Phase 6: Deployment & Monitoring

### 6.1 Pre-Deployment Checks

- [ ] Run `npm run lint` (fix any issues)
- [ ] Run `npm run build` (ensure production build works)
- [ ] Test production build locally (`npm run preview`)
- [ ] Review all code changes
- [ ] Verify no console errors/warnings

### 6.2 Deployment

- [ ] Commit changes with clear message
- [ ] Push to feature branch
- [ ] Create pull request
- [ ] Request code review
- [ ] Merge to main
- [ ] Deploy to production

### 6.3 Post-Deployment Monitoring

- [ ] Monitor for localStorage errors
- [ ] Check user adoption of offline feature
- [ ] Monitor submission success rates
- [ ] Gather user feedback

---

## Success Criteria

✅ **Functional Requirements:**
- Scouting data automatically saved to local storage on review page
- Dashboard displays all offline matches with upload status
- Users can upload individual or all pending matches
- System works with and without match_id
- Data integrity maintained throughout offline → online flow

✅ **User Experience:**
- Clear visual feedback for save/upload actions
- Intuitive interface in dashboard
- Graceful error handling with helpful messages
- No disruption to existing scouting workflow

✅ **Technical Quality:**
- Type-safe TypeScript implementation
- Proper error handling
- Efficient localStorage usage
- Compatible with schema versioning
- Well-documented code

✅ **Reliability:**
- Works offline and online
- Handles edge cases (quota, corruption, duplicates)
- Recovers from errors gracefully
- Doesn't lose user data

---

## Timeline Estimate

- **Phase 1:** Local Storage Service - Foundation work
- **Phase 2:** Review Page Integration - Critical path
- **Phase 3:** Dashboard UI - User-facing feature
- **Phase 4:** Edge Cases & Polish - Reliability
- **Phase 5:** Testing & Documentation - Quality assurance
- **Phase 6:** Deployment - Release

**Total Implementation:** Comprehensive offline storage system with failsafe capabilities

---

## Notes

- **Schema Compatibility:** Leverage existing schema versioning in `scoutingSchema.ts`
- **User Education:** Consider adding tooltip/help text explaining offline mode
- **Future Enhancements:**
  - Sync indicator in app header
  - Auto-upload on network restore
  - Conflict resolution for duplicate submissions
  - Export/import offline data for backup
