import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { CURRENT_YEAR, getTeamLogo } from "@/lib/blueAlliance";
import { TCG_RARITY_LABEL, type TcgCard as Card, type TcgRarity } from "@/lib/tcg";

/**
 * The team's FIRST logo from The Blue Alliance, for a card with no photo (none in the pit or on
 * TBA, or one that won't load); null until loaded, or if they have none.
 */
function useTeamLogoFallback(teamNumber: number, needed: boolean): string | null {
  const [loaded, setLoaded] = useState<{ team: number; logo: string | null } | null>(null);
  useEffect(() => {
    if (!needed) return;
    let cancelled = false;
    getTeamLogo(teamNumber, CURRENT_YEAR).then((logo) => {
      if (!cancelled) setLoaded({ team: teamNumber, logo });
    });
    return () => {
      cancelled = true;
    };
  }, [teamNumber, needed]);
  return needed && loaded?.team === teamNumber ? loaded.logo : null;
}

/** Each rarity's symbol (bottom left, as on a Pokémon card) and the card's colors. */
const RARITY_STYLE: Record<TcgRarity, { symbol: string; symbolClass: string; panel: string; frame: string }> = {
  common: { symbol: "●", symbolClass: "text-neutral-800", panel: "from-stone-100 via-stone-200 to-stone-300", frame: "border-stone-400" },
  uncommon: { symbol: "◆", symbolClass: "text-neutral-800", panel: "from-emerald-50 via-emerald-100 to-emerald-200", frame: "border-emerald-500" },
  rare: { symbol: "★", symbolClass: "text-neutral-800", panel: "from-sky-50 via-sky-100 to-sky-200", frame: "border-sky-500" },
  double_rare: { symbol: "★★", symbolClass: "text-neutral-900", panel: "from-violet-50 via-violet-100 to-fuchsia-200", frame: "border-violet-500" },
  ultra_rare: { symbol: "★★", symbolClass: "tcg-silver-text", panel: "from-amber-50 via-yellow-100 to-amber-300", frame: "border-amber-500" },
};

const HOLO: TcgRarity[] = ["double_rare", "ultra_rare"];

interface TcgCardProps {
  card: Card;
  /** Cards in the set, for "12/34". */
  setSize: number;
  /** Short set name shown with the card number, e.g. "MTTD 26". */
  setCode: string;
  /** Card width in px; everything inside scales with it. */
  width?: number;
  className?: string;
}

/**
 * A team's trading card, laid out like a Pokémon card: name and team number across the top,
 * a framed photo, an empty area where moves would go, and rarity and set number along the bottom.
 */
export function TcgCard({ card, setSize, setCode, width = 220, className = "" }: TcgCardProps) {
  const style = RARITY_STYLE[card.rarity];
  const holo = HOLO.includes(card.rarity);
  const [imageFailed, setImageFailed] = useState(false);
  // A logo stored with the card shows at once; otherwise one is looked up only when there's no
  // photo (or it won't load)
  const storedLogo = card.image_kind === "logo" ? card.image_url : null;
  const photo = storedLogo ? null : card.image_url;
  const fetchedLogo = useTeamLogoFallback(card.team_number, !storedLogo && (!photo || imageFailed));
  const logo = storedLogo ?? fetchedLogo;

  return (
    <div
      className={`relative select-none rounded-[0.9em] p-[0.55em] shadow-lg ${
        card.rarity === "ultra_rare" ? "tcg-gold-border" : "bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-400"
      } ${className}`}
      // Standard card proportions (63 × 88 mm); 1em = a twentieth of the width
      style={{ width, aspectRatio: "63 / 88", fontSize: width / 20 }}
      aria-label={`${card.team_name}, team ${card.team_number}, ${TCG_RARITY_LABEL[card.rarity]}`}
    >
      <div className={`relative flex h-full flex-col overflow-hidden rounded-[0.45em] bg-gradient-to-b ${style.panel} px-[0.55em] pt-[0.35em] pb-[0.3em] text-neutral-900`}>
        {/* Top: stage, name, and the team number where a Pokémon's HP goes */}
        <div className="flex items-center justify-between gap-[0.3em]">
          {/* The "TEAM" stage label left of the name, centered on it */}
          <div className="flex min-w-0 items-center gap-[0.3em]">
            <span className="shrink-0 text-[0.5em] font-bold uppercase leading-none tracking-wide text-neutral-600">Team</span>
            <span className="truncate text-[0.95em] font-extrabold leading-tight">{card.team_name}</span>
          </div>
          <span className="shrink-0 whitespace-nowrap font-extrabold leading-tight">
            <span className="text-[1.05em] text-red-700">{card.team_number}</span>
          </span>
        </div>

        {/* The photo, in a beveled frame */}
        <div className={`relative mt-[0.25em] overflow-hidden rounded-[0.15em] border-[0.22em] ${style.frame} bg-neutral-800 shadow-inner`} style={{ aspectRatio: "4 / 3" }}>
          {photo && !imageFailed ? (
            <img
              src={photo}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              draggable={false}
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
          ) : logo ? (
            // No photo: the team's logo, scaled up with crisp pixels on a light panel
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white to-neutral-200">
              <img src={logo} alt="" className="h-[70%] object-contain" style={{ imageRendering: "pixelated" }} draggable={false} />
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-[0.2em] bg-gradient-to-br from-neutral-600 to-neutral-800 text-neutral-300">
              <ImageOff style={{ width: "1.6em", height: "1.6em" }} />
              <span className="text-[0.55em] font-semibold uppercase tracking-wide">No photo</span>
            </div>
          )}
          {holo && <div className="tcg-holo pointer-events-none absolute inset-0" aria-hidden />}
        </div>

        {/* The strip under the photo (a Pokémon's species line) */}
        <div className="mx-[0.4em] -mt-[0.05em] rounded-b-[0.3em] bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 px-[0.4em] py-[0.08em] text-center text-[0.5em] font-semibold italic text-neutral-700 shadow-sm">
          <span className="block truncate">{card.location ? `Team ${card.team_number} · ${card.location}` : `Team ${card.team_number}`}</span>
        </div>

        {/* Where moves go (left empty for now) */}
        <div className="flex-1" />
        <div className="h-px bg-neutral-400/60" />

        {/* Bottom: rarity on the left, set and number on the right */}
        <div className="mt-[0.2em] flex items-center justify-between gap-[0.3em] text-[0.5em] font-bold">
          <span className="flex min-w-0 items-center gap-[0.35em]">
            <span className={`text-[1.25em] leading-none ${style.symbolClass}`}>{style.symbol}</span>
            <span className="truncate uppercase tracking-wide text-neutral-700">{TCG_RARITY_LABEL[card.rarity]}</span>
          </span>
          <span className="shrink-0 tabular-nums text-neutral-700">
            {setCode} · {String(card.number).padStart(3, "0")}/{String(setSize).padStart(3, "0")}
          </span>
        </div>
      </div>
    </div>
  );
}

/** A card face down. */
export function TcgCardBack({ width = 220, className = "", label }: { width?: number; className?: string; label?: string }) {
  return (
    <div
      className={`relative select-none rounded-[0.9em] bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-400 p-[0.55em] shadow-lg ${className}`}
      style={{ width, aspectRatio: "63 / 88", fontSize: width / 20 }}
    >
      <div className="tcg-back flex h-full flex-col items-center justify-center gap-[0.3em] rounded-[0.45em] text-white">
        <div className="flex h-[3.4em] w-[3.4em] items-center justify-center rounded-full border-[0.25em] border-white/90 bg-black/30 text-[1em] font-black">
          5026
        </div>
        <span className="text-[0.65em] font-bold tracking-[0.15em] text-white/90">ScouTCG</span>
        {label && <span className="mt-[0.3em] text-[0.8em] font-bold tabular-nums text-white/80">{label}</span>}
      </div>
    </div>
  );
}
