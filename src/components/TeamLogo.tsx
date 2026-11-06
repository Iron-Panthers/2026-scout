import { useEffect, useState } from "react";
import { getTeamLogo, CURRENT_YEAR } from "@/lib/blueAlliance";
import { useBBot } from "@/contexts/BBotContext";

interface TeamLogoProps {
  teamNumber: number;
  className?: string;
}

/**
 * TeamLogo displays a team's FIRST-issued avatar/logo from The Blue Alliance.
 * Falls back to the team number if no logo has been uploaded.
 *
 * At an event that converts B-bots, an off-season demo number (e.g. 9991 for 581's B bot)
 * shows its main team's logo with the robot's letter in the bottom-right corner.
 */
export function TeamLogo({
  teamNumber,
  className = "h-10 w-10 rounded-md object-contain bg-muted",
}: TeamLogoProps) {
  const bbot = useBBot(teamNumber);
  const logoTeam = bbot?.team ?? teamNumber;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadLogo = async () => {
      setLoaded(false);
      setLogoUrl(null);
      const url = await getTeamLogo(logoTeam, CURRENT_YEAR);
      if (!mounted) return;
      setLogoUrl(url);
      setLoaded(true);
    };

    loadLogo();

    return () => {
      mounted = false;
    };
  }, [logoTeam]);

  const logo = !loaded || !logoUrl ? (
    <div
      className={`${className} flex items-center justify-center text-[10px] font-bold text-muted-foreground`}
    >
      {logoTeam}
    </div>
  ) : (
    <img
      src={logoUrl}
      alt={bbot ? `Team ${teamNumber} (${bbot.team}'s ${bbot.bot} bot) logo` : `Team ${teamNumber} logo`}
      className={className}
    />
  );

  if (!bbot) return logo;
  return (
    <span className="relative inline-flex shrink-0" title={`${teamNumber} is ${bbot.team}'s ${bbot.bot} bot`}>
      {logo}
      <span className="absolute -right-1 -bottom-1 rounded px-1 text-[9px] leading-tight font-black text-primary-foreground ring-2 ring-background bg-primary">
        {bbot.bot}
      </span>
    </span>
  );
}
