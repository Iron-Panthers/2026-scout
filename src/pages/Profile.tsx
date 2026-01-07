import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, Phone, Calendar, Award } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function Profile() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();

  const userName =
    authUser?.user_metadata?.name || authUser?.email?.split("@")[0] || "User";
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl = authUser?.user_metadata?.avatar_url || "";
  const email = authUser?.email || "";
  const joinDate = authUser?.created_at
    ? new Date(authUser.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "Recently";

  const stats = [
    { label: "Matches Scouted", value: "47" },
    { label: "Teams Analyzed", value: "32" },
    { label: "Reports Submitted", value: "89" },
    { label: "Accuracy Rating", value: "98%" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto p-6 max-w-4xl">
        {/* Back Button */}
        <Button variant="ghost" className="mb-6" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {/* Profile Header */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              <Avatar className="h-32 w-32">
                <AvatarImage src={avatarUrl} alt={userName} />
                <AvatarFallback className="text-4xl bg-primary text-primary-foreground">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-center md:text-left">
                <h1 className="text-3xl font-bold mb-2">{userName}</h1>
                <Badge variant="secondary" className="mb-4">
                  Scout
                </Badge>
                <div className="space-y-2 mt-4">
                  <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span className="text-sm">{email}</span>
                  </div>
                  {authUser?.user_metadata?.phone && (
                    <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span className="text-sm">
                        {authUser.user_metadata.phone}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">Joined {joinDate}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Achievements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-2xl">🏆</span>
                </div>
                <div>
                  <p className="font-semibold">Perfect Attendance</p>
                  <p className="text-sm text-muted-foreground">
                    Scouted every match in the season
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-2xl">⭐</span>
                </div>
                <div>
                  <p className="font-semibold">Top Scout</p>
                  <p className="text-sm text-muted-foreground">
                    Highest accuracy rating on the team
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-2xl">🎯</span>
                </div>
                <div>
                  <p className="font-semibold">Detail Oriented</p>
                  <p className="text-sm text-muted-foreground">
                    Completed 50+ detailed reports
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
