import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export default function RealtimeTest() {
  const { user } = useAuth();
  const [status, setStatus] = useState<string>("Not connected");
  const [events, setEvents] = useState<string[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const addEvent = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setEvents((prev) => [`[${timestamp}] ${msg}`, ...prev].slice(0, 20));
  };

  useEffect(() => {
    if (!user?.id) return;

    addEvent("Setting up Realtime subscription...");

    const channel = supabase
      .channel("realtime-test")
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to all events
          schema: "public",
          table: "match_assignment_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          addEvent(`✅ REALTIME EVENT RECEIVED: ${payload.eventType}`);
          addEvent(`Data: ${JSON.stringify(payload.new)}`);

          // Show browser notification
          if (Notification.permission === "granted") {
            new Notification("Realtime Event!", {
              body: "Match assignment notification received!",
            });
          }
        }
      )
      .subscribe((status) => {
        setStatus(status);
        addEvent(`Subscription status: ${status}`);
        if (status === "SUBSCRIBED") {
          setIsSubscribed(true);
          addEvent("✅ Successfully subscribed to Realtime!");
        }
      });

    return () => {
      addEvent("Cleaning up subscription...");
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const testAssignment = async () => {
    if (!user?.id) return;

    addEvent("Creating test assignment...");

    // Get a match
    const { data: matches } = await supabase
      .from("matches")
      .select("id, match_number")
      .limit(1);

    if (!matches || matches.length === 0) {
      addEvent("❌ No matches found in database");
      return;
    }

    const match = matches[0];

    // Assign yourself to red1
    const { error } = await supabase
      .from("matches")
      .update({ red1_scouter_id: user.id })
      .eq("id", match.id);

    if (error) {
      addEvent(`❌ Error: ${error.message}`);
    } else {
      addEvent(`✅ Assigned yourself to Match ${match.match_number} (red1)`);
      addEvent("Waiting for Realtime event...");
    }
  };

  const checkTrigger = async () => {
    if (!user?.id) return;

    addEvent("Checking match_assignment_notifications table...");

    const { data, error } = await supabase
      .from("match_assignment_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      addEvent(`❌ Error: ${error.message}`);
    } else if (data && data.length > 0) {
      addEvent(`✅ Found ${data.length} notifications in DB`);
      data.forEach((notif, i) => {
        addEvent(`  ${i + 1}. ${notif.role} - ${notif.notified ? "✅ Notified" : "⏳ Pending"}`);
      });
    } else {
      addEvent("⚠️ No notifications found - trigger might not be working");
    }
  };

  const checkRealtime = async () => {
    addEvent("Checking Realtime publication...");

    const { data, error } = await supabase.rpc("check_realtime_publication", {});

    if (error) {
      addEvent("❌ Can't check publication (need to create function)");
      addEvent("Run this SQL instead:");
      addEvent("SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';");
    } else {
      addEvent(`✅ Realtime check: ${JSON.stringify(data)}`);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">Realtime Test</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <strong>User ID:</strong> {user?.id || "Not logged in"}
            </div>
            <div>
              <strong>Realtime Status:</strong>{" "}
              <span
                className={
                  isSubscribed ? "text-green-500 font-bold" : "text-yellow-500"
                }
              >
                {status}
              </span>
            </div>
            <div>
              <strong>Notification Permission:</strong> {Notification.permission}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={testAssignment} className="w-full">
              1. Assign Myself to a Match (Trigger Test)
            </Button>
            <Button onClick={checkTrigger} variant="outline" className="w-full">
              2. Check Database for Notifications
            </Button>
            <Button onClick={checkRealtime} variant="outline" className="w-full">
              3. Check Realtime Publication
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded font-mono text-xs max-h-96 overflow-y-auto">
              {events.length === 0 ? (
                <div className="text-muted-foreground">
                  Waiting for events...
                </div>
              ) : (
                events.map((event, i) => (
                  <div key={i} className="mb-1">
                    {event}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              <strong>Expected Flow:</strong>
            </p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Page loads → "Subscription status: SUBSCRIBED" appears</li>
              <li>Click "Assign Myself to a Match"</li>
              <li>Within 1-2 seconds → "✅ REALTIME EVENT RECEIVED" appears</li>
              <li>Browser notification pops up</li>
            </ol>
            <p className="text-muted-foreground mt-4">
              If you see "SUBSCRIBED" but no event after assignment, the trigger
              might not be working.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
