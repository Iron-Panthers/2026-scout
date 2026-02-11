import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export default function SimpleRealtimeTest() {
  const { user } = useAuth();
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    // Always log this first
    const initialLog = `Page mounted. User ID: ${user?.id || "NO USER"}`;
    console.log(initialLog);
    setLog([initialLog]);

    if (!user?.id) {
      console.log("No user - stopping here");
      return;
    }

    console.log("Setting up Realtime...");
    setLog((prev) => [...prev, "Setting up Realtime..."]);

    const channel = supabase
      .channel("test-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_assignment_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const msg = `EVENT: ${payload.eventType}`;
          console.log(msg, payload);
          setLog((prev) => [...prev, msg]);
          alert("Realtime event received! Check console.");
        }
      )
      .subscribe((status) => {
        const statusMsg = `Status: ${status}`;
        console.log(statusMsg);
        setLog((prev) => [...prev, statusMsg]);
      });

    return () => {
      console.log("Cleaning up");
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <div style={{ padding: "20px", fontFamily: "monospace" }}>
      <h1>Simple Realtime Test</h1>
      <div style={{ marginTop: "20px" }}>
        <strong>User ID:</strong> {user?.id || "Not logged in"}
      </div>
      <div style={{ marginTop: "20px", backgroundColor: "#f5f5f5", padding: "10px" }}>
        <h3>Log:</h3>
        {log.length === 0 ? (
          <div>No logs yet...</div>
        ) : (
          log.map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>
      <div style={{ marginTop: "20px" }}>
        <button
          onClick={async () => {
            console.log("Button clicked");
            setLog((prev) => [...prev, "Button clicked"]);

            if (!user?.id) {
              alert("Not logged in");
              return;
            }

            const { data: matches } = await supabase
              .from("matches")
              .select("id, match_number")
              .limit(1);

            if (!matches || matches.length === 0) {
              alert("No matches found");
              return;
            }

            const { error } = await supabase
              .from("matches")
              .update({ red1_scouter_id: user.id })
              .eq("id", matches[0].id);

            if (error) {
              alert("Error: " + error.message);
            } else {
              alert("Assigned! Waiting for event...");
              setLog((prev) => [...prev, `Assigned to match ${matches[0].match_number}`]);
            }
          }}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Assign Me to a Match
        </button>
      </div>
    </div>
  );
}
