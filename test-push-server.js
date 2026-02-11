// Test script for push notification Edge Function
// Usage: node test-push-server.js

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FUNCTION_URL = "https://qwzsrlbhwigozonzthvx.supabase.co/functions/v1/send-match-notifications";

if (!SERVICE_ROLE_KEY) {
  console.error("❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable not set");
  console.log("\nGet it from: Supabase Dashboard → Settings → API → service_role");
  console.log("\nThen run:");
  console.log("  SUPABASE_SERVICE_ROLE_KEY=your_key_here node test-push-server.js");
  process.exit(1);
}

console.log("🚀 Testing Edge Function...\n");
console.log(`URL: ${FUNCTION_URL}`);
console.log(`Auth: Bearer ${SERVICE_ROLE_KEY.substring(0, 20)}...\n`);

fetch(FUNCTION_URL, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  },
})
  .then((response) => {
    console.log(`Status: ${response.status} ${response.statusText}`);
    return response.json();
  })
  .then((data) => {
    console.log("\n📦 Response:");
    console.log(JSON.stringify(data, null, 2));

    if (data.error) {
      console.log("\n❌ Error occurred!");
    } else if (data.message && data.message.includes("0 notifications")) {
      console.log("\n⚠️  No notifications sent. Possible reasons:");
      console.log("  1. No active events in database");
      console.log("  2. No matches in the next 5 minutes");
      console.log("  3. No users subscribed to push notifications");
    } else {
      console.log("\n✅ Success!");
    }
  })
  .catch((error) => {
    console.error("\n❌ Request failed:");
    console.error(error.message);
  });
