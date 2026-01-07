import type { DashboardHeaderProps } from "@/types";

export default function DashboardHeader({
  userName,
  subtitle = "Ready to scout for the Iron Panthers",
}: DashboardHeaderProps) {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-2">
        Hi, <span className="text-primary">{userName}</span>
      </h1>
      <p className="text-muted-foreground">{subtitle}</p>
    </div>
  );
}
