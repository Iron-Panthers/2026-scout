import { useState } from "react";
import type { DashboardHeaderProps } from "@/types";

const DEFAULT_SUBTITLES = [
  "Do you want candy????",
  "Oh my god we're cooked",
  "You better scout well",
  "Norbert is watching",
  "Scouting is life trust",
  "Lemons!!!",
  "Baller",
  "Buy a decoration today",
  "6 7",
  "A reminder to bet on the next match",
  "Fist my bump!",
  "50 26!",
  "Are you playing Mosim right now?",
  "Don't give up!!!",
];

export default function DashboardHeader({
  userName,
  subtitle,
}: DashboardHeaderProps) {
  const [randomSubtitle] = useState(
    () => DEFAULT_SUBTITLES[Math.floor(Math.random() * DEFAULT_SUBTITLES.length)],
  );

  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">
        Hi, <span className="text-primary">{userName}</span>
      </h1>
      <p className="text-muted-foreground">{subtitle ?? randomSubtitle}</p>
    </div>
  );
}
