import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { submitScoutingData, resolveMatchId } from "@/lib/scoutingSchema";
import { useToast } from "@/hooks/use-toast";
import { SubmissionStatusModal } from "@/components/SubmissionStatusModal";
import { saveOfflineMatch, markAsUploaded, generateOfflineKey } from "@/lib/offlineStorage";
import { supabase } from "@/lib/supabase";

// Recursive JSON editor for objects/arrays
function RecursiveJsonEditor({ value, onChange, path = [] }) {
  // Helper: is this a phase key? (customize as needed)
  const isPhaseKey = (k) =>
    [
      "auto",
      "transition-shift",
      "phase1",
      "phase2",
      "phase3",
      "phase4",
      "endgame",
    ].includes(k);

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const entries = Object.entries(value);
    const shouldAutoCollapse = entries.length > 20;
    const [isCollapsed, setIsCollapsed] = useState(shouldAutoCollapse);

    return (
      <div className="space-y-2 pl-6 border-l-2 border-border relative">
        {entries.length > 5 && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -top-6 right-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            type="button"
          >
            {isCollapsed ? (
              <ChevronRight size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
            <span>{entries.length} properties</span>
          </button>
        )}
        {!isCollapsed &&
          entries.map(([key, val], idx, arr) => {
            const isPrimitive =
              val === null ||
              ["string", "number", "boolean"].includes(typeof val);
            const isObjOrArr = typeof val === "object" && val !== null;
            return (
              <div
                key={key}
                className={isObjOrArr ? "mb-2" : "flex items-center gap-2"}
              >
                {isPhaseKey(key) && idx !== 0 && (
                  <div className="my-4 border-t-2 border-primary/60 opacity-80" />
                )}
                {isObjOrArr && (
                  <div className="block font-mono text-xs text-muted-foreground min-w-[120px] break-all select-none mb-1 mt-2">
                    {key}
                  </div>
                )}
                {isPrimitive && (
                  <label className="block font-mono text-xs text-muted-foreground min-w-[120px] break-all select-none">
                    {key}
                  </label>
                )}
                <RecursiveJsonEditor
                  value={val}
                  onChange={(newVal) => {
                    const updated = { ...value, [key]: newVal };
                    onChange(updated);
                  }}
                  path={[...path, key]}
                />
              </div>
            );
          })}
      </div>
    );
  } else if (Array.isArray(value)) {
    const shouldAutoCollapse = value.length > 20;
    const [isCollapsed, setIsCollapsed] = useState(shouldAutoCollapse);

    return (
      <div className="space-y-2 pl-6 border-l-2 border-border relative">
        {value.length > 5 && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -top-6 right-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            type="button"
          >
            {isCollapsed ? (
              <ChevronRight size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
            <span>{value.length} items</span>
          </button>
        )}
        {!isCollapsed &&
          value.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <label className="block font-mono text-xs text-muted-foreground min-w-[40px] select-none">
                [{idx}]
              </label>
              <RecursiveJsonEditor
                value={item}
                onChange={(newVal) => {
                  const updated = value.slice();
                  updated[idx] = newVal;
                  onChange(updated);
                }}
                path={[...path, idx]}
              />
            </div>
          ))}
      </div>
    );
  } else if (typeof value === "string") {
    return (
      <input
        className="flex-1 bg-background border border-border rounded px-3 py-2 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/80"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else if (typeof value === "number") {
    return (
      <input
        type="number"
        className="flex-1 bg-background border border-border rounded px-3 py-2 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/80"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  } else if (typeof value === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 accent-primary"
      />
    );
  } else if (value === null) {
    return <span className="italic text-muted-foreground">null</span>;
  } else {
    return <span className="italic text-muted-foreground">[unsupported]</span>;
  }
}

export default function ScoutingReview() {
  const navigate = useNavigate();
  const { encoded } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();

  // Decode state from base64url param
  let initialState: any = null;
  if (encoded) {
    try {
      const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        Array.prototype.map
          .call(
            atob(base64),
            (c: string) => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`
          )
          .join("")
      );
      initialState = JSON.parse(json);
    } catch (e) {
      initialState = null;
    }
  }

  const [state, setState] = useState<any>(initialState);
  const [rawEdit, setRawEdit] = useState(false);
  const [rawEditOpen, setRawEditOpen] = useState(true);
  const [rawValue, setRawValue] = useState(() =>
    JSON.stringify(initialState, null, 2)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [dependencies, setDependencies] = useState<Array<{
    label: string;
    status: "pending" | "checking" | "success" | "error";
    value?: string | number;
    errorMessage?: string;
  }>>([]);
  const [resolvedMatchId, setResolvedMatchId] = useState<string | null>(null);
  const [offlineKey, setOfflineKey] = useState<string | null>(null);

  // Log the decoded state
  console.log("ScoutingReview state loaded:", {
    matchId: state?.matchId,
    event_id: state?.event_id,
    match_number: state?.match_number,
    role: state?.role,
  });

  // Auto-save to offline storage on component mount
  useEffect(() => {
    const saveToOfflineStorage = async () => {
      if (!state?.event_id || !state?.match_number || !state?.role) {
        console.warn("Missing required fields for offline storage");
        return;
      }

      try {
        // Fetch event code from event_id
        const { data: event, error } = await supabase
          .from("events")
          .select("event_code")
          .eq("id", state.event_id)
          .single();

        if (error || !event?.event_code) {
          console.warn("Could not fetch event code for offline storage:", error);
          // Use event_id as fallback if event_code not available
          const fallbackCode = state.event_id.slice(0, 8);
          const key = saveOfflineMatch(
            fallbackCode,
            state.match_number,
            state.role,
            state,
            {
              matchId: state.matchId,
              eventId: state.event_id,
              scouterId: user?.id,
            }
          );
          if (key) {
            setOfflineKey(key);
            console.log("Match saved to offline storage (fallback):", key);
          }
          return;
        }

        // Save to offline storage
        const key = saveOfflineMatch(
          event.event_code,
          state.match_number,
          state.role,
          state,
          {
            matchId: state.matchId,
            eventId: state.event_id,
            scouterId: user?.id,
          }
        );

        if (key) {
          setOfflineKey(key);
          console.log("Match saved to offline storage:", key);
          toast({
            title: "Saved Offline",
            description: "Match data saved for offline backup",
            duration: 3000,
          });
        } else {
          console.warn("Failed to save to offline storage");
        }
      } catch (error) {
        console.error("Error saving to offline storage:", error);
      }
    };

    // Run once on mount if we have a valid state
    if (state) {
      saveToOfflineStorage();
    }
  }, []); // Empty deps - run once on mount

  // Update the base64url in the route when state changes
  useEffect(() => {
    if (!state || !encoded) return;
    try {
      const json = JSON.stringify(state);
      const base64 = btoa(
        encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
          String.fromCharCode(parseInt(p1, 16))
        )
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      // Only update if different
      if (base64 !== encoded) {
        const newUrl = `/review/${base64}`;
        window.history.replaceState(null, "", newUrl);
      }
    } catch {
      // ignore
    }
  }, [state, encoded]);

  // Handlers for note fields
  const handleFieldChange = (
    field: "comments" | "errors" | "defenseDescription",
    value: string
  ) => {
    setState((prev: any) => ({ ...prev, [field]: value }));
    setRawValue((prevRaw) => {
      try {
        const updated = { ...state, [field]: value };
        return JSON.stringify(updated, null, 2);
      } catch {
        return prevRaw;
      }
    });
  };

  // Handler for raw JSON edit
  const handleRawChange = (val: string) => {
    setRawValue(val);
    try {
      const parsed = JSON.parse(val);
      setState(parsed);
    } catch {
      // ignore parse errors, keep editing
    }
  };

  // Check dependencies and resolve matchId if needed
  const checkDependencies = async () => {
    console.log("=== CHECK DEPENDENCIES ===");
    console.log("Current state:", state);
    console.log("state.matchId:", state?.matchId, "Type:", typeof state?.matchId);
    console.log("state.event_id:", state?.event_id, "Type:", typeof state?.event_id);
    console.log("state.match_number:", state?.match_number, "Type:", typeof state?.match_number);
    console.log("state.role:", state?.role, "Type:", typeof state?.role);

    const deps = [
      {
        label: "Match ID",
        status: "pending" as const,
        value: state?.matchId || "Not set",
      },
      {
        label: "Event ID",
        status: "pending" as const,
        value: state?.event_id || "Not set",
      },
      {
        label: "Match Number",
        status: "pending" as const,
        value: state?.match_number || "Not set",
      },
      {
        label: "Role",
        status: "pending" as const,
        value: state?.role || "Not set",
      },
      {
        label: "Scouter ID",
        status: "pending" as const,
        value: user?.id || "Not logged in",
      },
    ];

    setDependencies(deps);
    setShowStatusModal(true);

    // Check each dependency
    const updatedDeps = [...deps];

    // Check matchId
    if (state?.matchId && state.matchId.trim() !== "") {
      updatedDeps[0] = {
        ...updatedDeps[0],
        status: "success",
      };
      setResolvedMatchId(state.matchId);
    } else if (state?.event_id && state?.match_number && state?.role) {
      // Try to resolve matchId
      updatedDeps[0] = {
        ...updatedDeps[0],
        status: "checking",
        value: "Resolving...",
      };
      setDependencies([...updatedDeps]);

      try {
        const resolved = await resolveMatchId(
          state.event_id,
          state.match_number,
          state.role
        );

        if (resolved) {
          updatedDeps[0] = {
            ...updatedDeps[0],
            status: "success",
            value: resolved,
          };
          setResolvedMatchId(resolved);
        } else {
          updatedDeps[0] = {
            ...updatedDeps[0],
            status: "error",
            value: "Could not resolve",
            errorMessage: "Match not found in database",
          };
        }
      } catch (error) {
        updatedDeps[0] = {
          ...updatedDeps[0],
          status: "error",
          value: "Resolution failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        };
      }
    } else {
      updatedDeps[0] = {
        ...updatedDeps[0],
        status: "error",
        errorMessage: "Missing event_id, match_number, or role",
      };
    }

    // Check event_id
    if (state?.event_id && state.event_id.trim() !== "") {
      updatedDeps[1] = {
        ...updatedDeps[1],
        status: "success",
      };
    } else {
      updatedDeps[1] = {
        ...updatedDeps[1],
        status: "error",
        errorMessage: "Event ID is required",
      };
    }

    // Check match_number
    if (state?.match_number && state.match_number > 0) {
      updatedDeps[2] = {
        ...updatedDeps[2],
        status: "success",
      };
    } else {
      updatedDeps[2] = {
        ...updatedDeps[2],
        status: "error",
        errorMessage: "Match number must be greater than 0",
      };
    }

    // Check role
    if (state?.role && state.role.trim() !== "") {
      updatedDeps[3] = {
        ...updatedDeps[3],
        status: "success",
      };
    } else {
      updatedDeps[3] = {
        ...updatedDeps[3],
        status: "error",
        errorMessage: "Role is required",
      };
    }

    // Check scouter_id
    if (user?.id) {
      updatedDeps[4] = {
        ...updatedDeps[4],
        status: "success",
      };
    } else {
      updatedDeps[4] = {
        ...updatedDeps[4],
        status: "error",
        errorMessage: "User not logged in",
      };
    }

    setDependencies(updatedDeps);
  };

  // Handle final submission
  const handleSubmit = async () => {
    const matchId = resolvedMatchId || state?.matchId;

    console.log("Submitting with matchId:", matchId, "Type:", typeof matchId);
    console.log("Full state:", state);

    if (!matchId) {
      toast({
        title: "Cannot Submit",
        description: "Match ID could not be determined",
        variant: "destructive",
      });
      return;
    }

    // Validate that matchId is a UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(matchId)) {
      console.error("Invalid UUID format for matchId:", matchId);
      toast({
        title: "Invalid Match ID",
        description: `Match ID "${matchId}" is not a valid UUID. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await submitScoutingData(
        matchId,
        state.role,
        state,
        user?.id
      );

      // Mark as uploaded in offline storage
      if (offlineKey) {
        const marked = markAsUploaded(offlineKey);
        if (marked) {
          console.log("Marked offline match as uploaded:", offlineKey);
        }
      }

      toast({
        title: "Success!",
        description: "Scouting data submitted successfully.",
      });

      setShowStatusModal(false);
      navigate("/dashboard");
    } catch (error) {
      console.error("Error submitting scouting data:", error);
      toast({
        title: "Submission Failed",
        description: error instanceof Error ? error.message : "An error occurred while submitting.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!state) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-red-600 font-bold">
        No scouting data found. Please return to the scouting page.
      </div>
    );
  }
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 md:py-16">
      <div className="bg-card border border-border rounded-2xl shadow-sm p-8 md:p-10">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-8 tracking-tight text-center">
          Review &amp; Submit
        </h1>

        {/* Notes Section */}
        <section className="mb-10">
          <h2 className="text-lg md:text-xl font-semibold text-primary mb-6">
            Additional Notes
          </h2>
          <div className="mb-6">
            <label className="block uppercase text-xs font-medium tracking-wider text-muted-foreground mb-2">
              Comments
            </label>
            <textarea
              className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground text-base font-normal focus:outline-none focus:ring-2 focus:ring-primary/80 transition disabled:opacity-60"
              rows={3}
              value={state.comments}
              onChange={(e) => handleFieldChange("comments", e.target.value)}
              style={{ fontFamily: "inherit", resize: "vertical" }}
            />
          </div>
          <div className="mb-6">
            <label className="block uppercase text-xs font-medium tracking-wider text-muted-foreground mb-2">
              Errors
            </label>
            <textarea
              className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground text-base font-normal focus:outline-none focus:ring-2 focus:ring-primary/80 transition disabled:opacity-60"
              rows={2}
              value={state.errors}
              onChange={(e) => handleFieldChange("errors", e.target.value)}
              style={{ fontFamily: "inherit", resize: "vertical" }}
            />
          </div>
          <div>
            <label className="block uppercase text-xs font-medium tracking-wider text-muted-foreground mb-2">
              Defense Description
            </label>
            <textarea
              className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground text-base font-normal focus:outline-none focus:ring-2 focus:ring-primary/80 transition disabled:opacity-60"
              rows={2}
              value={state.defenseDescription}
              onChange={(e) =>
                handleFieldChange("defenseDescription", e.target.value)
              }
              style={{ fontFamily: "inherit", resize: "vertical" }}
            />
          </div>
        </section>

        {/* Divider */}
        <div className="my-10 border-t border-dashed border-border" />

        {/* Raw Data Section */}
        <section className="mb-8">
          <h2 className="text-lg md:text-xl font-semibold text-primary mb-4">
            Raw Scouting Data
          </h2>
          <Collapsible open={rawEditOpen} onOpenChange={setRawEditOpen}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CollapsibleTrigger asChild>
                  <button
                    className="flex items-center justify-center w-8 h-8 rounded border border-border transition-colors"
                    type="button"
                    aria-label={rawEditOpen ? "Collapse" : "Expand"}
                  >
                    {rawEditOpen ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </button>
                </CollapsibleTrigger>
                <span className="text-xs font-semibold text-muted-foreground">
                  Edit Raw Data
                </span>
              </div>
              <button
                className={`ml-2 text-xs font-medium px-3 py-1 rounded border border-border transition-colors ${
                  rawEdit
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "bg-surface-elevated text-muted-foreground hover:bg-surface"
                }`}
                onClick={() => setRawEdit((e) => !e)}
                type="button"
              >
                {rawEdit ? "Done Editing" : "Edit"}
              </button>
            </div>
            <CollapsibleContent>
              <div className="bg-surface-elevated border border-subtle rounded-lg p-5 py-8 overflow-x-auto">
                {rawEdit ? (
                  <RecursiveJsonEditor
                    value={state}
                    onChange={(newVal) => {
                      setState(newVal);
                      setRawValue(JSON.stringify(newVal, null, 2));
                    }}
                  />
                ) : (
                  <pre className="text-[0.93rem] leading-6 font-mono text-foreground whitespace-pre select-all overflow-x-auto">
                    {rawValue}
                  </pre>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </section>

        {/* Actions */}
        <div className="flex flex-col md:flex-row gap-4 justify-center mt-10">
          <Button
            variant="outline"
            className="h-10 px-6 rounded-lg font-medium border border-border text-foreground hover:bg-surface-elevated hover:border-primary transition"
            onClick={() => {
              if (state?.matchId && state?.role && state?.event_id) {
                const params = new URLSearchParams({
                  match_id: state.matchId,
                  role: state.role,
                  event_id: state.event_id,
                  match_number: state.match_number?.toString() || "0",
                });
                navigate(`/scouting?${params.toString()}`);
              } else {
                navigate("/dashboard");
              }
            }}
          >
            Back to Scouting
          </Button>
          <Button
            variant="default"
            className="h-10 px-6 rounded-lg font-medium bg-primary text-white hover:bg-primary/90 transition"
            onClick={checkDependencies}
          >
            Submit
          </Button>
        </div>
      </div>

      <SubmissionStatusModal
        open={showStatusModal}
        onOpenChange={setShowStatusModal}
        dependencies={dependencies}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        canSubmit={dependencies.every((dep) => dep.status === "success")}
      />
    </main>
  );
}
