# Offline Storage Testing Guide

This guide provides step-by-step instructions for testing the offline storage feature.

## Prerequisites

1. Application running locally (`npm run dev`)
2. Valid Supabase credentials configured
3. User account with scout access
4. At least one event and match created in the database

## Test Scenarios

### 1. Basic Auto-Save Flow

**Objective:** Verify that match data is automatically saved to offline storage when reaching the review page.

**Steps:**
1. Log in as a scout user
2. Navigate to Dashboard
3. Start a scouting session for an assigned match
4. Record some sample data (shots, counters, comments)
5. Navigate to the review page
6. **Expected Result:** Toast notification appears: "Saved Offline"
7. Open browser DevTools → Console
8. **Expected Result:** Log message: "Match saved to offline storage: [key]"
9. Open DevTools → Application → Local Storage
10. Look for key: `offline_matches`
11. **Expected Result:** JSON data containing your match

**Pass Criteria:**
- ✅ Toast notification appears
- ✅ Console log confirms save
- ✅ LocalStorage contains match data
- ✅ Match data includes all scouted information

---

### 2. Dashboard Display

**Objective:** Verify that offline matches are displayed correctly on the dashboard.

**Steps:**
1. Complete Test Scenario 1 to have at least one offline match
2. Navigate to Dashboard
3. Scroll down to find "Offline Matches" section
4. **Expected Result:** Card showing offline matches appears
5. **Expected Result:** Match shows as "Not Uploaded" with red badge
6. **Expected Result:** Match details include: match number, role, event code, timestamp
7. **Expected Result:** Network status indicator shows online/offline status

**Pass Criteria:**
- ✅ Offline Matches section is visible
- ✅ Match card displays all metadata
- ✅ Upload button is present and enabled (when online)
- ✅ Badge shows "Not Uploaded"

---

### 3. Single Match Upload

**Objective:** Test uploading a single offline match to the database.

**Steps:**
1. Ensure you have at least one pending offline match (from Test Scenario 1)
2. Navigate to Dashboard → Offline Matches section
3. Click "Upload" button on a pending match
4. **Expected Result:** Button shows loading state (spinning icon)
5. Wait for upload to complete
6. **Expected Result:** Toast notification: "Upload Successful"
7. **Expected Result:** Match badge changes to green checkmark
8. **Expected Result:** Match moves to "Uploaded" section
9. Verify in database (Supabase dashboard → scouting_submissions table)
10. **Expected Result:** New row with matching match_id, role, and data

**Pass Criteria:**
- ✅ Upload button works
- ✅ Loading state displays
- ✅ Success notification appears
- ✅ Match marked as uploaded
- ✅ Data appears in database

---

### 4. Batch Upload (Upload All)

**Objective:** Test batch uploading multiple offline matches.

**Steps:**
1. Create 3+ offline matches by scouting multiple matches
2. Do NOT upload them individually
3. Navigate to Dashboard → Offline Matches section
4. Click "Upload All" button in the header
5. **Expected Result:** Button shows "Uploading..." state
6. Wait for all uploads to complete
7. **Expected Result:** Toast notification: "All Matches Uploaded" or "Upload Complete with Errors"
8. **Expected Result:** All matches show green checkmarks
9. **Expected Result:** All matches move to "Uploaded" section
10. Verify in database that all matches were uploaded

**Pass Criteria:**
- ✅ Upload All button works
- ✅ All pending matches are uploaded
- ✅ Success/error feedback is clear
- ✅ All data appears in database

---

### 5. Offline Mode Testing

**Objective:** Verify that the app handles offline scenarios correctly.

**Steps:**
1. Start a scouting session with internet enabled
2. Record match data
3. Navigate to review page (data auto-saved)
4. **Disable internet connection** (turn off WiFi or use browser DevTools)
5. Try to submit the match
6. **Expected Result:** Submission fails with error message
7. Navigate to Dashboard
8. **Expected Result:** Network status shows offline icon (WifiOff)
9. **Expected Result:** Blue notification box: "You're offline. Matches will be uploaded when connection is restored."
10. **Expected Result:** Upload buttons are disabled
11. **Re-enable internet connection**
12. **Expected Result:** Network status updates to online icon (Wifi)
13. **Expected Result:** Upload buttons become enabled
14. Click "Upload" on the pending match
15. **Expected Result:** Upload succeeds

**Pass Criteria:**
- ✅ Offline status detected correctly
- ✅ Upload buttons disabled when offline
- ✅ Clear offline messaging displayed
- ✅ Buttons re-enable when online
- ✅ Upload works after reconnection

---

### 6. Database Verification

**Objective:** Ensure the system correctly identifies which matches are already in the database.

**Steps:**
1. Have at least one match already uploaded to the database
2. Navigate to Dashboard → Offline Matches
3. Look at the uploaded match
4. **Expected Result:** Match shows green checkmark (uploaded status)
5. **Expected Result:** No "Upload" button, only "Delete" button
6. Manually delete the submission from the database (Supabase dashboard)
7. Refresh the Dashboard page
8. **Expected Result:** System re-verifies and shows yellow warning icon
9. **Expected Result:** Tooltip or indicator shows "Not found in database"

**Pass Criteria:**
- ✅ Uploaded matches show correct status
- ✅ Verification detects database presence
- ✅ Missing database entries are detected

---

### 7. Storage Quota Warning

**Objective:** Test storage quota warning functionality.

**Steps:**
1. Create many offline matches (20+ matches)
2. Navigate to Dashboard → Offline Matches
3. Check if yellow warning box appears
4. **Expected Result:** If storage > 80% of ~5MB limit, warning displays
5. **Expected Result:** Warning message: "Storage is almost full. Consider uploading and clearing old matches."

**Note:** This test may require modifying `isApproachingQuota()` threshold temporarily.

**Pass Criteria:**
- ✅ Warning appears when quota threshold exceeded
- ✅ Warning message is clear and actionable

---

### 8. Delete Uploaded Match

**Objective:** Test cleanup of uploaded matches from local storage.

**Steps:**
1. Have at least one uploaded match in offline storage
2. Navigate to Dashboard → Offline Matches → Uploaded section
3. Click the trash icon (Delete button) on an uploaded match
4. **Expected Result:** Match is removed from the list
5. **Expected Result:** Toast notification: "Match Deleted"
6. Check LocalStorage in browser DevTools
7. **Expected Result:** Match key no longer exists in offline_matches

**Pass Criteria:**
- ✅ Delete button works
- ✅ Match removed from UI
- ✅ Match removed from LocalStorage
- ✅ Confirmation notification appears

---

### 9. Match ID Resolution

**Objective:** Test automatic match_id resolution when missing.

**Steps:**
1. Scout a match but ensure match_id is somehow missing (may need to manually test)
2. Ensure event_id and match_number are present
3. Navigate to Dashboard → Offline Matches
4. Click "Upload" on the match
5. **Expected Result:** System attempts to resolve match_id
6. **Expected Result:** Upload succeeds if match exists in database
7. **Expected Result:** Error message if match cannot be found

**Pass Criteria:**
- ✅ System attempts resolution
- ✅ Upload succeeds with resolved match_id
- ✅ Clear error if resolution fails

---

### 10. Data Integrity Check

**Objective:** Verify that uploaded data matches the original scouting data.

**Steps:**
1. Scout a match with known data:
   - Add exactly 5 shots
   - Set specific counter values (e.g., trenchLeftHome = 3)
   - Add specific comment text
2. Navigate to review page (auto-save)
3. Upload the match from Dashboard
4. Check the database (scouting_submissions table)
5. Inspect the `scouting_data` JSONB column
6. **Expected Result:** All shots are present (count = 5)
7. **Expected Result:** Counter values match exactly
8. **Expected Result:** Comment text is identical
9. **Expected Result:** All phases have correct data structure

**Pass Criteria:**
- ✅ Shot count matches
- ✅ Counter values are accurate
- ✅ Text fields are preserved
- ✅ No data loss or corruption

---

## Edge Cases & Error Scenarios

### E1. Browser LocalStorage Disabled

**Steps:**
1. Disable localStorage in browser settings/DevTools
2. Scout a match and navigate to review page
3. **Expected Result:** No error thrown, graceful degradation
4. **Expected Result:** Console warning: "localStorage is not available"

### E2. Corrupted LocalStorage Data

**Steps:**
1. Manually edit localStorage `offline_matches` value to invalid JSON
2. Navigate to Dashboard
3. **Expected Result:** App doesn't crash
4. **Expected Result:** Console error logged
5. **Expected Result:** Empty offline matches displayed

### E3. Duplicate Match Scouting

**Steps:**
1. Scout the same match twice (same event, match number, role)
2. Review both submissions
3. **Expected Result:** Both are saved with different timestamps
4. **Expected Result:** Both appear in offline matches
5. Upload both
6. **Expected Result:** Database contains multiple submissions for same match

### E4. Very Large Match Data

**Steps:**
1. Scout a match with 100+ shots
2. Save to offline storage
3. **Expected Result:** Data saves successfully
4. Upload to database
5. **Expected Result:** Upload succeeds without truncation

---

## Regression Testing Checklist

After implementing offline storage, verify existing functionality still works:

- [ ] Normal online scouting flow (without going offline)
- [ ] Direct submission from review page (bypassing offline upload)
- [ ] Manager dashboard features
- [ ] Profile and settings pages
- [ ] Other database queries (matches, events, etc.)
- [ ] Authentication and authorization
- [ ] Navigation between pages

---

## Performance Testing

### P1. LocalStorage Read/Write Speed

**Objective:** Ensure offline storage doesn't slow down the app.

**Method:**
1. Use browser DevTools Performance tab
2. Record timeline while saving to offline storage
3. **Expected Result:** Save operation < 100ms
4. Record timeline while loading dashboard with 50+ offline matches
5. **Expected Result:** Load time < 500ms

### P2. Memory Usage

**Objective:** Ensure offline storage doesn't cause memory leaks.

**Method:**
1. Open browser DevTools → Performance → Memory
2. Take heap snapshot
3. Create 20+ offline matches
4. Navigate away and back to dashboard multiple times
5. Take another heap snapshot
6. **Expected Result:** No significant memory growth
7. **Expected Result:** No detached DOM nodes from OfflineMatches component

---

## Automated Testing (Future)

**Recommended Unit Tests:**
- `offlineStorage.ts`: saveOfflineMatch(), getOfflineMatches(), markAsUploaded()
- localStorage quota detection
- Network status hook
- Upload functionality error handling

**Recommended Integration Tests:**
- Full flow: scout → review → auto-save → dashboard → upload
- Offline mode: disable network → attempt upload → re-enable → upload
- Data integrity: verify uploaded data matches source

---

## Bug Reporting Template

If you encounter issues during testing, use this template:

```
**Test Scenario:** [Number and name]
**Steps to Reproduce:**
1.
2.
3.

**Expected Result:**


**Actual Result:**


**Screenshots/Logs:**


**Environment:**
- Browser:
- OS:
- Network Status: Online/Offline
- LocalStorage Size:
```

---

## Sign-Off

After completing all test scenarios, sign off:

- [ ] All basic scenarios (1-10) passed
- [ ] All edge cases handled gracefully
- [ ] No regression in existing features
- [ ] Performance is acceptable
- [ ] Documentation is accurate

**Tester Name:** _________________
**Date:** _________________
**Notes:** _________________
