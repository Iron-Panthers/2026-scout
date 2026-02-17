import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, AlertCircle } from "lucide-react";

interface DependencyStatus {
  label: string;
  status: "pending" | "checking" | "success" | "error";
  value?: string | number;
  errorMessage?: string;
}

interface SubmissionStatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dependencies: DependencyStatus[];
  onSubmit: () => void;
  isSubmitting: boolean;
  canSubmit: boolean;
}

export function SubmissionStatusModal({
  open,
  onOpenChange,
  dependencies,
  onSubmit,
  isSubmitting,
  canSubmit,
}: SubmissionStatusModalProps) {
  const getStatusIcon = (status: DependencyStatus["status"]) => {
    switch (status) {
      case "success":
        return <Check className="h-5 w-5 text-green-500" />;
      case "error":
        return <X className="h-5 w-5 text-destructive" />;
      case "checking":
        return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
      case "pending":
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: DependencyStatus["status"]) => {
    switch (status) {
      case "success":
        return "text-green-500";
      case "error":
        return "text-destructive";
      case "checking":
        return "text-muted-foreground";
      case "pending":
        return "text-muted-foreground";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Submission Status</DialogTitle>
          <DialogDescription>
            Checking dependencies before submitting scouting data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2 overflow-y-auto flex-1">
          {dependencies.map((dep, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2 rounded-lg bg-accent/50"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="flex-shrink-0">
                  {getStatusIcon(dep.status)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{dep.label}</p>
                  {dep.value && (
                    <p className="text-xs text-muted-foreground truncate">
                      {dep.value}
                    </p>
                  )}
                  {dep.status === "error" && dep.errorMessage && (
                    <p className="text-xs text-destructive mt-0.5 line-clamp-2">
                      {dep.errorMessage}
                    </p>
                  )}
                </div>
              </div>
              <span
                className={`text-xs font-medium uppercase flex-shrink-0 ml-2 ${getStatusColor(
                  dep.status
                )}`}
              >
                {dep.status}
              </span>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
