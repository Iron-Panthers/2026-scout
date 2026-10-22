import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AchievementIcon } from "@/components/AchievementIcon";
import { useAuth } from "@/contexts/AuthContext";
import { useAchievements } from "@/hooks/useAchievements";
import { getPublicProfile, type PublicProfile } from "@/lib/profiles";

/**
 * Every achievement, earned ones first, with progress toward the rest. /achievements is
 * your own; /achievements/:userId is someone else's (anyone signed in can view it).
 */
export default function Achievements() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { userId: routeUserId } = useParams();
  const isOwn = !routeUserId || routeUserId === user?.id;
  const viewedId = isOwn ? user?.id : routeUserId;

  const [other, setOther] = useState<PublicProfile | null>(null);
  useEffect(() => {
    if (isOwn || !viewedId) return;
    let cancelled = false;
    getPublicProfile(viewedId).then((found) => !cancelled && setOther(found));
    return () => {
      cancelled = true;
    };
  }, [isOwn, viewedId]);

  const teamYears = (isOwn ? profile?.team_years : other?.team_years) ?? [];
  // Someone else's team years come with their profile: wait for it before working anything out
  const achievements = useAchievements(isOwn || other ? viewedId : null, teamYears);
  const name = isOwn ? "Your" : other ? `${other.name}'s` : "";
  const earned = achievements?.filter((achievement) => achievement.earned).length ?? 0;
  const pointsEarned = achievements?.reduce((sum, achievement) => sum + (achievement.earned ? achievement.points : 0), 0) ?? 0;
  // Earned first, then the ones still to get, with secret (still hidden) ones last
  const rank = (achievement: { earned: boolean; secret?: boolean }) => (achievement.earned ? 0 : achievement.secret ? 2 : 1);
  const sorted = achievements ? [...achievements].sort((a, b) => rank(a) - rank(b)) : [];

  return (
    <div className="min-h-screen bg-background my-5">
      <main className="container mx-auto max-w-4xl p-6">
        <Button variant="ghost" className="mb-6" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl font-bold">{name} Achievements</h1>
          {achievements && (
            <div className="text-right">
              <p className="text-lg font-semibold text-muted-foreground">
                <span className="text-primary">{earned}</span>/{achievements.length} achievements
              </p>
              <p className="text-sm text-muted-foreground">{pointsEarned.toLocaleString()} points earned</p>
            </div>
          )}
        </div>

        {achievements && (
          <div className="mb-6 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(earned / achievements.length) * 100}%` }} />
          </div>
        )}

        {!achievements ? (
          <p className="py-10 text-center text-muted-foreground">Loading achievements...</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sorted.map((achievement) => {
              // Secret ones stay a mystery until earned
              const hidden = !!achievement.secret && !achievement.earned;
              return (
              <Card key={achievement.id} className={achievement.earned ? "" : "opacity-70"}>
                <CardContent className="flex items-center gap-4 p-4">
                  <AchievementIcon icon={achievement.icon} earned={achievement.earned} hidden={hidden} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-semibold">{hidden ? "???" : achievement.name}</p>
                      {!achievement.earned && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    </div>
                    <p className="text-sm text-muted-foreground">{hidden ? "???" : achievement.description}</p>
                    {/* What it pays (hidden too while it's secret) */}
                    <p className={`mt-1 text-xs font-semibold ${achievement.earned ? "text-primary" : "text-muted-foreground"}`}>
                      {hidden ? "??? points" : `${achievement.earned ? "Earned " : ""}+${achievement.points} points`}
                    </p>
                    {/* Progress toward ones that take more than one step (never for secret ones) */}
                    {!achievement.earned && !hidden && achievement.goal > 1 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/60"
                            style={{ width: `${(achievement.progress / achievement.goal) * 100}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {achievement.progress}/{achievement.goal}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
