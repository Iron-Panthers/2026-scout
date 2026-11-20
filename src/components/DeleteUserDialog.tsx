import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  onDeleted: () => void;
}

/** A developer deleting someone else's account, confirmed by typing DELETE (as in Settings). */
export function DeleteUserDialog({ open, onOpenChange, userId, userName, onDeleted }: DeleteUserDialogProps) {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (next: boolean) => {
    if (deleting) return;
    if (next) {
      setConfirm("");
      setError(null);
    }
    onOpenChange(next);
  };

  const remove = async () => {
    setDeleting(true);
    setError(null);
    // delete_user_account: developers only; removes the sign-in and everything personal, keeps scouting data
    const { error: rpcError } = await supabase.rpc("delete_user_account", { p_user: userId });
    setDeleting(false);
    if (rpcError) {
      setError(rpcError.message || "Couldn't delete this account.");
      return;
    }
    onOpenChange(false);
    onDeleted();
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {userName}'s account?</DialogTitle>
          <DialogDescription>
            This permanently deletes their profile, coins, bets, messages, achievements and personal
            picklists. Their scouting submissions stay with the team, without their name. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-user-confirm">Type DELETE to confirm</Label>
          <Input id="delete-user-confirm" value={confirm} autoComplete="off" onChange={(e) => setConfirm(e.target.value)} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={deleting} onClick={() => change(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={confirm !== "DELETE" || deleting} onClick={remove}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
