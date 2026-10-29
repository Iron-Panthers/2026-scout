import {
  Bug,
  CalendarDays,
  ClipboardCheck,
  Crown,
  Dices,
  Eye,
  Flame,
  Globe,
  HelpCircle,
  House,
  ListChecks,
  MapPin,
  MessageCircle,
  Radio,
  Shirt,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AchievementIcon as AchievementIconName } from "@/lib/achievements";

const ICONS: Record<AchievementIconName, LucideIcon> = {
  clipboard: ClipboardCheck,
  map: MapPin,
  trophy: Trophy,
  users: Users,
  crown: Crown,
  bug: Bug,
  star: Star,
  calendar: CalendarDays,
  globe: Globe,
  sparkles: Sparkles,
  shirt: Shirt,
  flame: Flame,
  house: House,
  dice: Dices,
  list: ListChecks,
  eye: Eye,
  trending: TrendingUp,
  radio: Radio,
  message: MessageCircle,
};

/** An achievement's badge: coloured when earned, greyed out when not. */
export function AchievementIcon({
  icon,
  earned,
  size = "md",
  hidden = false,
}: {
  icon: AchievementIconName;
  earned: boolean;
  size?: "sm" | "md";
  /** A secret achievement not earned yet: a question mark instead of its real icon. */
  hidden?: boolean;
}) {
  const Icon = hidden ? HelpCircle : ICONS[icon];
  const box = size === "sm" ? "h-8 w-8" : "h-12 w-12";
  const glyph = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full ${box} ${
        earned ? "bg-primary text-primary-foreground shadow-md" : "bg-muted text-muted-foreground/60"
      }`}
    >
      <Icon className={glyph} />
    </div>
  );
}
