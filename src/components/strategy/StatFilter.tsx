import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  COMPARISONS,
  STAT_FILTERS,
  describeStatFilter,
  type Comparison,
  type StatFilterKey,
  type StatFilterValue,
} from "@/lib/statFilter";

/** The live picklist's stat filter: a button that opens "Filter...", and the filter in use. */
export function StatFilterButton({
  filter,
  onChange,
  loading,
}: {
  filter: StatFilterValue | null;
  onChange: (filter: StatFilterValue | null) => void;
  /** The teams' stats are still loading, so the filter can't apply yet. */
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [stat, setStat] = useState<StatFilterKey>("autoFuel");
  const [comparison, setComparison] = useState<Comparison>("gt");
  const [text, setText] = useState("");
  const target = text.trim() === "" ? NaN : Number(text);
  const valid = Number.isFinite(target);

  const openDialog = () => {
    // Start from the filter in use, if there is one
    if (filter) {
      setStat(filter.stat);
      setComparison(filter.comparison);
      setText(String(filter.target));
    }
    setOpen(true);
  };

  const apply = () => {
    if (!valid) return;
    onChange({ stat, comparison, target, decimals: text.split(".")[1]?.length ?? 0 });
    setOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button variant={filter ? "default" : "outline"} className="gap-1.5" onClick={openDialog}>
          <SlidersHorizontal className="h-4 w-4" />
          <span className="max-w-48 truncate">{filter ? describeStatFilter(filter) : "Filter"}</span>
        </Button>
        {filter && (
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Clear filter" title="Clear filter" onClick={() => onChange(null)}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Filter...</DialogTitle>
            <DialogDescription>
              Teams that don't fit fade out. Teams without data for the stat count as not fitting.
              {loading && " Team stats are still loading."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
            <Select value={stat} onValueChange={(value) => setStat(value as StatFilterKey)}>
              <SelectTrigger className="w-full" aria-label="Stat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAT_FILTERS.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={comparison} onValueChange={(value) => setComparison(value as Comparison)}>
              <SelectTrigger className="w-full" aria-label="Comparison">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPARISONS.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="Value"
              inputMode="decimal"
              value={text}
              onChange={(changeEvent) => {
                if (/^-?\d*\.?\d*$/.test(changeEvent.target.value)) setText(changeEvent.target.value);
              }}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === "Enter") apply();
              }}
            />
          </div>
          <DialogFooter>
            {filter && (
              <Button
                variant="outline"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Clear filter
              </Button>
            )}
            <Button disabled={!valid} onClick={apply}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
