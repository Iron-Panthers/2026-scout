# Edge Function Deployment Guide

## Prerequisites

1. **Supabase CLI** - Install if you haven't:
```bash
npm install -g supabase
```

2. **Login to Supabase**:
```bash
npx supabase login
```
This will open your browser to authenticate.

3. **Link to your project**:
```bash
npx supabase link --project-ref qwzsrlbhwigozonzthvx
```

## Deploy the Function

```bash
npx supabase functions deploy send-match-notifications
```

**Expected output:**
```
Deploying send-match-notifications (project: qwzsrlbhwigozonzthvx)
Bundling send-match-notifications
Deploying send-match-notifications (version xxx)
✓ Deployed send-match-notifications
```

## Set Environment Secrets

You need to set these secrets (replace with your actual values):

```bash
npx supabase secrets set \
  TBA_AUTH_KEY=fnwAT6yo0t4otgOrZ4EwZiZ2yPBAtxAcubngPwbcSYqtdaK9Jmmw4q3jttGNc7IY \
  VAPID_SUBJECT=mailto:your@email.com \
  VAPID_PUBLIC_KEY=BKvjCAMmofctkK4kltD6GaQNNftbghWvZfG-cboSbbJV9nqU3gqKJ0eMRb6hEXeEfCa9yq1C8MpLdxU3tH0O6jc \
  VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY_FROM_WEB_PUSH_GENERATE
```

**Note:** Replace `YOUR_PRIVATE_KEY_FROM_WEB_PUSH_GENERATE` with the actual private key.

To verify secrets were set:
```bash
npx supabase secrets list
```

## Test the Function Manually

### Get your Service Role Key:
1. Supabase Dashboard → Settings → API
2. Copy the `service_role` key (starts with `eyJ...`)

### Invoke the function:

```bash
curl -X POST \
  "https://qwzsrlbhwigozonzthvx.supabase.co/functions/v1/send-match-notifications" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

**Expected response:**
```json
{"message":"Sent 0 notifications"}
```

Or if there are no active events:
```json
{"message":"No active events"}
```

## Debug: View Function Logs

```bash
npx supabase functions logs send-match-notifications --tail
```

Or in Dashboard: **Edge Functions** → **send-match-notifications** → **Logs**

## Common Issues

### Issue 1: "Function not found"
**Fix:** Make sure you deployed: `npx supabase functions deploy send-match-notifications`

### Issue 2: "Secrets not set"
**Fix:** Run `npx supabase secrets set ...` again

### Issue 3: "web-push module not found"
**Fix:** The Edge Function uses `https://esm.sh/web-push@3.6.7` which should work in Deno. If it fails, check the function logs.

### Issue 4: "No active events"
**Fix:** You need to have an event marked as active in your database:
```sql
UPDATE events SET is_active = true WHERE id = 'YOUR_EVENT_ID';
UPDATE events SET event_code = '2025week1' WHERE id = 'YOUR_EVENT_ID';
```
