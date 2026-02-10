import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { applyUpdate } from "@/lib/swRegistration";
import { RefreshCw } from "lucide-react";

export default function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    const handler = () => setShowUpdate(true);
    window.addEventListener("sw-update-available", handler);
    return () => window.removeEventListener("sw-update-available", handler);
  }, []);

  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-primary text-primary-foreground p-4 rounded-lg shadow-lg flex items-center justify-between max-w-md mx-auto">
      <span className="text-sm font-medium">A new version is available</span>
      <Button size="sm" variant="secondary" onClick={applyUpdate}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Update
      </Button>
    </div>
  );
}
