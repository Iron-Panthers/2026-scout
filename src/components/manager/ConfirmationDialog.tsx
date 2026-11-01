import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  prompt: string;
  onOpenChange: (open: boolean) => void;
  onRespond: (confirmed: boolean) => void | Promise<void>;
}

export function ConfirmationDialog({
  open,
  title,
  prompt,
  onOpenChange,
  onRespond,
}: ConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {prompt}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => { onOpenChange(false); onRespond(false); }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => { onOpenChange(false); onRespond(true); }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
