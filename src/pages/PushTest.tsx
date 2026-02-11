import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export default function PushTest() {
  const { user } = useAuth();
  const [message, setMessage] = useState("Test notification from 2026 Scout!");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const sendTestNotification = async () => {
    if (!user?.id) {
      setResult("❌ Not logged in");
      return;
    }

    setLoading(true);
    setResult("Sending...");

    try {
      // Get service role key from .env or ask user
      const serviceRoleKey = prompt(
        "Enter your Supabase SERVICE ROLE KEY:\n\n(Get it from: Supabase Dashboard → Settings → API)\n\nThis is needed to call the Edge Function."
      );

      if (!serviceRoleKey) {
        setResult("❌ Service role key required");
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/test-push-notification`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: user.id,
            message: message,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setResult(`✅ Success!\n\nSent: ${data.sent}\nFailed: ${data.failed}\n\n${data.message}`);
      } else {
        setResult(`❌ Error: ${data.error}\n\nHint: ${data.hint || "Check Edge Function logs"}`);
      }
    } catch (error: any) {
      setResult(`❌ Request failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const checkSubscriptions = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      setResult(`❌ Error: ${error.message}`);
    } else if (data && data.length > 0) {
      setResult(`✅ Found ${data.length} subscription(s):\n\n${JSON.stringify(data[0], null, 2)}`);
    } else {
      setResult("❌ No subscriptions found.\n\nGo to Settings → Enable 'Match Assignments' to subscribe.");
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">Push Notification Test</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Test Server-Side Push</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="user-id">Your User ID</Label>
              <Input
                id="user-id"
                value={user?.id || "Not logged in"}
                disabled
                className="font-mono text-sm"
              />
            </div>

            <div>
              <Label htmlFor="message">Custom Message</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Test notification message..."
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <Button onClick={sendTestNotification} disabled={loading} className="flex-1">
                {loading ? "Sending..." : "🚀 Send Test Push"}
              </Button>
              <Button onClick={checkSubscriptions} variant="outline">
                Check Subscriptions
              </Button>
            </div>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded">
                {result}
              </pre>
            </CardContent>
          </Card>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Setup Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <strong>1. Deploy the test Edge Function:</strong>
              <pre className="bg-muted p-2 rounded mt-1">
                npx supabase functions deploy test-push-notification
              </pre>
            </div>

            <div>
              <strong>2. Make sure secrets are set:</strong>
              <pre className="bg-muted p-2 rounded mt-1">
                npx supabase secrets set VAPID_PRIVATE_KEY=xxx VAPID_PUBLIC_KEY=xxx VAPID_SUBJECT=mailto:you@team.com
              </pre>
            </div>

            <div>
              <strong>3. Enable notifications in Settings:</strong>
              <p className="text-muted-foreground mt-1">
                Go to Settings → Toggle "Match Assignments" ON to create a push subscription
              </p>
            </div>

            <div>
              <strong>4. Click "Send Test Push" above</strong>
              <p className="text-muted-foreground mt-1">
                You'll be prompted for your Service Role Key (needed to call Edge Functions)
              </p>
            </div>

            <div className="text-muted-foreground pt-4 border-t">
              <p>
                <strong>Alternative:</strong> Test via curl:
              </p>
              <pre className="bg-muted p-2 rounded mt-1 text-xs overflow-x-auto">
{`curl -X POST "https://qwzsrlbhwigozonzthvx.supabase.co/functions/v1/test-push-notification" \\
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"user_id":"${user?.id || "YOUR_USER_ID"}","message":"Test!"}'`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
