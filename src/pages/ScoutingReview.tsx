import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { submitScoutingData, resolveMatchId } from "@/lib/scoutingSchema";
import { useToast } from "@/hooks/use-toast";
import { SubmissionStatusModal } from "@/components/SubmissionStatusModal";
import SafeQRCode from "@/components/SafeQRCode";
import {
  saveOfflineMatch,
  markAsUploaded,
  generateOfflineKey,
} from "@/lib/offlineStorage";
import { supabase } from "@/lib/supabase";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  // Check if opened with manager parameter
  const isManagerMode = searchParams.get("forScoutingManager") === "true";

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
  const [writtenTempState, setWrittenTempState] = useState<any>({ defense: null, problems: null, errors: null });
  const [rawEdit, setRawEdit] = useState(false);
  const [rawEditOpen, setRawEditOpen] = useState(true);
  const [rawValue, setRawValue] = useState(() =>
    JSON.stringify(initialState, null, 2)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [dependencies, setDependencies] = useState<
    Array<{
      label: string;
      status: "pending" | "checking" | "success" | "error";
      value?: string | number;
      errorMessage?: string;
    }>
  >([]);
  const [resolvedMatchId, setResolvedMatchId] = useState<string | null>(null);
  const [offlineKey, setOfflineKey] = useState<string | null>(null);
  const [qrCodeError, setQrCodeError] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showManagerModal, setShowManagerModal] = useState(false);

  // Check if URL is too large for QR code (QR codes have limits around 2953 bytes for alphanumeric)
  useEffect(() => {
    const urlLength = window.location.href.length;
    // QR Code with error correction level M can handle ~2953 bytes
    // But the actual data capacity is lower after encoding, so use 1500 as safe limit
    if (urlLength > 1500) {
      setQrCodeError(true);
    } else {
      setQrCodeError(false);
    }
  }, [encoded]);

  // Show manager modal if opened with manager parameter
  useEffect(() => {
    if (isManagerMode && state) {
      setShowManagerModal(true);
    }
  }, [isManagerMode, state]);

  // Log the decoded state
  console.log("ScoutingReview state loaded:", {
    matchId: state?.matchId,
    event_code: state?.event_code,
    match_number: state?.match_number,
    match_type: state?.match_type,
    role: state?.role,
  });

  // Auto-save to offline storage (debounced)
  const lastSaveRef = useRef<number>(0);
  useEffect(() => {
    if (!state?.event_code || !state?.match_number || !state?.role) {
      return;
    }

    // Debounce saves to avoid performance issues
    const timeoutId = setTimeout(async () => {
      try {
        // Save to offline storage with event_code directly
        const key = saveOfflineMatch(
          state.event_code,
          state.match_number,
          state.role,
          state,
          {
            matchId: state.matchId,
            scouterId: user?.id,
          }
        );

        if (key) {
          setOfflineKey(key);
          const now = Date.now();
          // Only show toast if it's been more than 5 seconds since last save
          if (now - lastSaveRef.current > 5000) {
            console.log("Match saved to offline storage:", key);
            toast({
              title: "Saved",
              description: "Changes saved to offline storage",
              duration: 2000,
            });
            lastSaveRef.current = now;
          }
        }
      } catch (error) {
        console.error("Error saving to offline storage:", error);
      }
    }, 1000); // Wait 1 second after last change before saving

    return () => clearTimeout(timeoutId);
  }, [state, user?.id, toast]); // Save whenever state changes

  // Update the base64url in the route when state changes (debounced)
  useEffect(() => {
    if (!state || !encoded) return;

    // Debounce URL updates to avoid performance issues during editing
    const timeoutId = setTimeout(() => {
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
    }, 500); // Wait 500ms after last change before updating URL

    // Cleanup timeout on unmount or when deps change
    return () => clearTimeout(timeoutId);
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
    // Check comments first before opening modal
    if (!state?.comments || state.comments.trim() === "") {
      toast({
        title: "Comments Required",
        description: "Please add comments before submitting",
        variant: "destructive",
      });
      return;
    }

    console.log("=== CHECK DEPENDENCIES ===");
    console.log("Current state:", state);
    console.log(
      "state.matchId:",
      state?.matchId,
      "Type:",
      typeof state?.matchId
    );
    console.log(
      "state.event_code:",
      state?.event_code,
      "Type:",
      typeof state?.event_code
    );
    console.log(
      "state.match_number:",
      state?.match_number,
      "Type:",
      typeof state?.match_number
    );
    console.log("state.role:", state?.role, "Type:", typeof state?.role);

    const deps = [
      {
        label: "Comments",
        status: "pending" as const,
        value: state?.comments ? "Provided" : "Not set",
      },
      {
        label: "Match ID",
        status: "pending" as const,
        value: state?.matchId || "Not set",
      },
      {
        label: "Event Code",
        status: "pending" as const,
        value: state?.event_code || "Not set",
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

    // Check comments
    if (state?.comments && state.comments.trim() !== "") {
      updatedDeps[0] = {
        ...updatedDeps[0],
        status: "success",
      };
    } else {
      updatedDeps[0] = {
        ...updatedDeps[0],
        status: "error",
        errorMessage: "Comments are required",
      };
    }

    // Check matchId
    if (state?.matchId && state.matchId.trim() !== "") {
      updatedDeps[1] = {
        ...updatedDeps[1],
        status: "success",
      };
      setResolvedMatchId(state.matchId);
    } else if (state?.event_code && state?.match_number && state?.role) {
      // Try to resolve matchId
      updatedDeps[1] = {
        ...updatedDeps[1],
        status: "checking",
        value: "Resolving...",
      };
      setDependencies([...updatedDeps]);

      try {
        const resolved = await resolveMatchId(
          state.event_code,
          state.match_number,
          state.role
        );

        if (resolved) {
          updatedDeps[1] = {
            ...updatedDeps[1],
            status: "success",
            value: resolved,
          };
          setResolvedMatchId(resolved);
        } else {
          updatedDeps[1] = {
            ...updatedDeps[1],
            status: "error",
            value: "Could not resolve",
            errorMessage: "Match not found in database",
          };
        }
      } catch (error) {
        updatedDeps[1] = {
          ...updatedDeps[1],
          status: "error",
          value: "Resolution failed",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        };
      }
    } else {
      updatedDeps[1] = {
        ...updatedDeps[1],
        status: "error",
        errorMessage: "Missing event_code, match_number, or role",
      };
    }

    // Check event_code
    if (state?.event_code && state.event_code.trim() !== "") {
      updatedDeps[2] = {
        ...updatedDeps[2],
        status: "success",
      };
    } else {
      updatedDeps[2] = {
        ...updatedDeps[2],
        status: "error",
        errorMessage: "Event code is required",
      };
    }

    // Check match_number
    if (state?.match_number && state.match_number > 0) {
      updatedDeps[3] = {
        ...updatedDeps[3],
        status: "success",
      };
    } else {
      updatedDeps[3] = {
        ...updatedDeps[3],
        status: "error",
        errorMessage: "Match number must be greater than 0",
      };
    }

    // Check role
    if (state?.role && state.role.trim() !== "") {
      updatedDeps[4] = {
        ...updatedDeps[4],
        status: "success",
      };
    } else {
      updatedDeps[4] = {
        ...updatedDeps[4],
        status: "error",
        errorMessage: "Role is required",
      };
    }

    // Check scouter_id
    if (user?.id) {
      updatedDeps[5] = {
        ...updatedDeps[5],
        status: "success",
      };
    } else {
      updatedDeps[5] = {
        ...updatedDeps[5],
        status: "error",
        errorMessage: "User not logged in",
      };
    }

    setDependencies(updatedDeps);
  };

  // Handle manager mode quick submission
  const handleManagerSubmit = async () => {
    setShowManagerModal(false);
    // Use existing submission flow
    await checkDependencies();
  };

  // Handle copying link with forScoutingManager parameter
  const handleCopyLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("forScoutingManager", "true");
      await navigator.clipboard.writeText(url.toString());
      setLinkCopied(true);
      toast({
        title: "Link Copied",
        description: "Link with manager parameter copied to clipboard",
      });
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy link to clipboard",
        variant: "destructive",
      });
    }
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
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
      await submitScoutingData(matchId, state.role, state, user?.id, state.team_number, state.match_type);

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
        description:
          error instanceof Error
            ? error.message
            : "An error occurred while submitting.",
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
              Comments <span className="text-destructive">*</span>
            </label>
            <textarea
              className={`w-full bg-background rounded-lg px-4 py-3 text-foreground text-base font-normal focus:outline-none transition disabled:opacity-60 ${
                !state.comments || state.comments.trim() === ""
                  ? "border-2 border-destructive focus:ring-2 focus:ring-destructive/50"
                  : "border border-border focus:ring-2 focus:ring-primary/80"
              }`}
              rows={3}
              value={state.comments}
              onChange={(e) => handleFieldChange("comments", e.target.value)}
              style={{ fontFamily: "inherit", resize: "vertical" }}
              placeholder="Please describe what happened during this match..."
            />
            {(!state.comments || state.comments.trim() === "") && (
              <p className="text-xs text-destructive mt-1">Comments are required before submission</p>
            )}
          </div>
          <div className="mb-6">
            <label className="block uppercase text-xs font-medium tracking-wider text-muted-foreground m-5 mb-2 flex items-center">
              Robot Problems?&nbsp;&nbsp;&nbsp;
              <Checkbox className="w-7 h-7 border-b-gray-500" checked={state.robot_problems !== null} onCheckedChange={(checked) => 
                handleFieldChange(
                  "robot_problems",
                  checked ? writtenTempState.problems || "" : null
                )
              }/>
            </label>
            {state.robot_problems !== null && 
              <textarea
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground text-base font-normal focus:outline-none focus:ring-2 focus:ring-primary/80 transition disabled:opacity-60"
                rows={2}
                value={state.robot_problems}
                onChange={(e) => { handleFieldChange("robot_problems", e.target.value); writtenTempState.problems = e.target.value; setWrittenTempState(writtenTempState); }}
                style={{ fontFamily: "inherit", resize: "vertical" }}
              />
            }
          </div>
          <div className="mb-6">
            <label className="block uppercase text-xs font-medium tracking-wider text-muted-foreground m-5 mb-2 flex items-center">
              Scouting Errors?&nbsp;&nbsp;&nbsp;
              <Checkbox className="w-7 h-7 border-b-gray-500" checked={state.errors !== null} onCheckedChange={(checked) => 
                handleFieldChange(
                  "errors",
                  checked ? writtenTempState.errors || "" : null
                )
              }/>
            </label>
            {state.errors !== null &&
              <textarea
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground text-base font-normal focus:outline-none focus:ring-2 focus:ring-primary/80 transition disabled:opacity-60"
                rows={2}
                value={state.errors}
                onChange={(e) => { handleFieldChange("errors", e.target.value); writtenTempState.errors = e.target.value; setWrittenTempState(writtenTempState); }}
                style={{ fontFamily: "inherit", resize: "vertical" }}
              />
            }       
          </div>
          <div>
            <label className="block uppercase text-xs font-medium tracking-wider text-muted-foreground m-5 mb-2 flex items-center">
              Defense?&nbsp;&nbsp;&nbsp;
              <Checkbox className="w-7 h-7 border-b-gray-500" checked={state.defenseDescription !== null} onCheckedChange={(checked) => 
                handleFieldChange(
                  "defenseDescription",
                  checked ? writtenTempState.defense || "" : null
                )
              }/>
            </label>
            {state.defenseDescription !== null &&
              <textarea
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground text-base font-normal focus:outline-none focus:ring-2 focus:ring-primary/80 transition disabled:opacity-60"
                rows={2}
                value={state.defenseDescription}
                onChange={(e) =>
                  { handleFieldChange("defenseDescription", e.target.value); writtenTempState.defense = e.target.value; setWrittenTempState(writtenTempState); }
                }
                style={{ fontFamily: "inherit", resize: "vertical" }}
              />
      }
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-col md:flex-row gap-4 justify-center mb-5">
          <Button
            variant="outline"
            className="h-10 px-6 rounded-lg font-medium border border-border text-foreground hover:bg-surface-elevated hover:border-primary transition"
            onClick={() => navigate("/dashboard")}
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

        {/* Divider */}
        <div className="my-5 border-t border-dashed border-border" />

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

        {/* QR Code Section */}
        <div className="flex flex-col items-center mt-8 gap-3">
          <p className="text-sm text-muted-foreground">
            Share this scouting data
          </p>
          {!qrCodeError ? (
            <div className="bg-white p-4 rounded-lg border border-border">
              <SafeQRCode
                value={window.location.href}
                size={200}
                level="M"
                onError={() => setQrCodeError(true)}
              />
            </div>
          ) : (
            <div className="bg-muted/50 p-6 rounded-lg border border-border text-center">
              <p className="text-sm text-muted-foreground">
                Data too large for QR code
              </p>
            </div>
          )}
          <Button
            variant="outline"
            className="h-9 px-4 rounded-lg font-medium border border-border text-foreground hover:bg-surface-elevated transition gap-2"
            onClick={handleCopyLink}
          >
            {linkCopied ? (
              <>
                <Check size={16} />
                Copied!
              </>
            ) : (
              <>
                <Copy size={16} />
                Copy Link for Manager
              </>
            )}
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

      {/* Manager Quick Submit Modal */}
      {showManagerModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-card border-2 border-primary rounded-xl shadow-2xl p-6 max-w-md w-full text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                <Check className="w-8 h-8 text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">
                Manager Mode
              </h2>
              <p className="text-sm text-muted-foreground">
                You're viewing scouting data shared by a scout
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Match:</span>
                <span className="font-semibold text-foreground">
                  #{state?.match_number}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Event:</span>
                <span className="font-semibold text-foreground">
                  {state?.event_code}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Role:</span>
                <span className="font-semibold text-foreground">
                  {state?.role}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
