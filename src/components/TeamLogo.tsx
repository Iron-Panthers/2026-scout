import { useEffect, useState } from "react";
import { getTeamLogo, CURRENT_YEAR } from "@/lib/blueAlliance";

interface TeamLogoProps {
  teamNumber: number;
  className?: string;
}

/**
 * TeamLogo displays a team's FIRST-issued avatar/logo from The Blue Alliance.
 * Falls back to the team number if no logo has been uploaded.
 */
export function TeamLogo({
  teamNumber,
  className = "h-10 w-10 rounded-md object-contain bg-muted",
}: TeamLogoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadLogo = async () => {
      setLoaded(false);
      setLogoUrl(null);
      const url = await getTeamLogo(teamNumber, CURRENT_YEAR);
      if (!mounted) return;
      setLogoUrl(url);
      setLoaded(true);
    };

    loadLogo();

    return () => {
      mounted = false;
    };
  }, [teamNumber]);

  if (!loaded || !logoUrl) {
    return (
      <div
        className={`${className} flex items-center justify-center text-[10px] font-bold text-muted-foreground`}
      >
        {teamNumber}
      </div>
    );
  }

  return <img src={logoUrl} alt={`Team ${teamNumber} logo`} className={className} />;
}
