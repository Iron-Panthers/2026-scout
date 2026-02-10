import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export default function NotificationTest() {
  const { user } = useAuth();
  const { supported, subscribed, permission, toggleNotifications } =
    usePushNotifications();
  const [testResult, setTestResult] = useState<string>("");

  const handleSubscribe = async () => {
    setTestResult("Requesting permission...");
    const success = await toggleNotifications(true);
    if (success) {
      setTestResult("✅ Subscribed successfully! Check database.");
    } else {
      setTestResult("❌ Subscription failed. Check console.");
    }
  };

  const handleUnsubscribe = async () => {
    setTestResult("Unsubscribing...");
    await toggleNotifications(false);
    setTestResult("✅ Unsubscribed");
  };

  const checkSubscription = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      setTestResult(`❌ Database error: ${error.message}`);
    } else if (data && data.length > 0) {
      setTestResult(
        `✅ Found ${data.length} subscription(s) in database:\n${JSON.stringify(
          data[0],
          null,
          2
        )}`
      );
    } else {
      setTestResult("❌ No subscriptions found in database");
    }
  };

  const sendTestNotification = async () => {
    setTestResult("Sending test notification...");

    // This sends a notification directly from the client (for testing only)
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      setTestResult("❌ No service worker registration");
      return;
    }

    try {
      await registration.showNotification("Test Notification", {
        body: "This is a local test notification from the service worker",
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
        tag: "test",
        requireInteraction: false,
      });
      setTestResult("✅ Local notification sent! (This doesn't use push server)");
    } catch (err: any) {
      setTestResult(`❌ Failed: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">Push Notification Test</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <strong>Push Supported:</strong> {supported ? "✅ Yes" : "❌ No"}
            </div>
            <div>
              <strong>Permission:</strong> {permission}
            </div>
            <div>
              <strong>Subscribed:</strong> {subscribed ? "✅ Yes" : "❌ No"}
            </div>
            <div>
              <strong>User ID:</strong> {user?.id || "Not logged in"}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleSubscribe} className="w-full">
              1. Subscribe to Push Notifications
            </Button>
            <Button onClick={checkSubscription} variant="outline" className="w-full">
              2. Check Database for Subscription
            </Button>
            <Button onClick={sendTestNotification} variant="secondary" className="w-full">
              3. Send Test Notification (Local)
            </Button>
            <Button onClick={handleUnsubscribe} variant="destructive" className="w-full">
              Unsubscribe
            </Button>
          </CardContent>
        </Card>

        {testResult && (
          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded">
                {testResult}
              </pre>
            </CardContent>
          </Card>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>Step 1:</strong> Click "Subscribe to Push Notifications" and allow permission
            </p>
            <p>
              <strong>Step 2:</strong> Click "Check Database" to verify subscription was saved
            </p>
            <p>
              <strong>Step 3:</strong> Click "Send Test Notification" to test local notifications
            </p>
            <p className="text-muted-foreground">
              For server-side push notifications (Edge Function), you need to deploy the function
              and invoke it manually or via cron.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
