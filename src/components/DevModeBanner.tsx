import { FlaskConical } from "lucide-react";
import { useDevMode } from "@/contexts/DevModeContext";

/**
 * Persistent indicator shown app-wide while dev sandbox mode is on, so it's
 * never ambiguous whether the data on screen is real or fake.
 */
export default function DevModeBanner() {
  const { devMode } = useDevMode();
  if (!devMode) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-1.5 bg-amber-500 text-black text-xs font-semibold py-1 px-2 pointer-events-none">
      <FlaskConical className="h-3.5 w-3.5" />
      DEVELOPER SANDBOX MODE — nothing here is saved to your real account
    </div>
  );
}
