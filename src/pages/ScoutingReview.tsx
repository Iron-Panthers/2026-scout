import { useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

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
    return (
      <div className="space-y-2 pl-6 border-l-2 border-border">
        {Object.entries(value).map(([key, val], idx, arr) => {
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
    return (
      <div className="space-y-2 pl-6 border-l-2 border-border">
        {value.map((item, idx) => (
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
  const [rawValue, setRawValue] = useState(() =>
    JSON.stringify(initialState, null, 2)
  );

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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg md:text-xl font-semibold text-primary">
              Raw Scouting Data
            </h2>
            <button
              className={`text-xs font-medium px-3 py-1 rounded border border-border transition-colors ${
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
          <div className="bg-surface-elevated border border-subtle rounded-lg p-5 overflow-x-auto">
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
        </section>

        {/* Actions */}
        <div className="flex flex-col md:flex-row gap-4 justify-center mt-10">
          <Button
            variant="outline"
            className="h-10 px-6 rounded-lg font-medium border border-border text-foreground hover:bg-surface-elevated hover:border-primary transition"
            onClick={() => navigate("/scouting")}
          >
            Back to Scouting
          </Button>
          <Button
            variant="default"
            className="h-10 px-6 rounded-lg font-medium bg-primary text-white hover:bg-primary/90 transition"
            onClick={() => {
              console.log(state);
              alert("Submitted!");
            }}
          >
            Submit
          </Button>
        </div>
      </div>
    </main>
  );
}
