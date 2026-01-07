import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LayoutDashboard, Plus, Settings } from "lucide-react";
import React from "react";

const DemoDashboard = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-primary">
              Iron Panthers <span className="text-foreground">Scout</span>
            </h1>
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </button>
            </div>
          </div>
          <Button variant="ghost" size="icon">
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto p-6">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">
            Welcome back, <span className="text-primary">Scout</span>
          </h2>
          <p className="text-muted-foreground">
            Ready to collect competition data for the Iron Panthers
          </p>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Today's Matches</CardDescription>
              <CardTitle className="text-3xl font-bold">8</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                3 completed, 5 remaining
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Teams Scouted</CardDescription>
              <CardTitle className="text-3xl font-bold">24</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Out of 40 teams total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Your Contributions</CardDescription>
              <CardTitle className="text-3xl font-bold">12</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Reports submitted today
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Planned Matches Section */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Upcoming Matches</CardTitle>
                <CardDescription className="mt-1">
                  Join a match to start scouting
                </CardDescription>
              </div>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Join Match
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Match Item 1 */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-surface-elevated border border-border hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="font-mono font-semibold text-lg">Q-42</div>
                  <div className="h-8 w-px bg-border" />
                  <div>
                    <div className="text-sm font-medium">
                      Qualification Match 42
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Teams: 5026, 1234, 5678 vs 9012, 3456, 7890
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">In 15 min</Badge>
                  <Button size="sm">Scout</Button>
                </div>
              </div>

              {/* Match Item 2 */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-surface-elevated border border-border hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="font-mono font-semibold text-lg">Q-43</div>
                  <div className="h-8 w-px bg-border" />
                  <div>
                    <div className="text-sm font-medium">
                      Qualification Match 43
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Teams: 1111, 2222, 3333 vs 4444, 5555, 6666
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">In 25 min</Badge>
                  <Button size="sm" variant="secondary">
                    Scout
                  </Button>
                </div>
              </div>

              {/* Match Item 3 */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-surface-elevated border border-border hover:border-primary/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="font-mono font-semibold text-lg">Q-44</div>
                  <div className="h-8 w-px bg-border" />
                  <div>
                    <div className="text-sm font-medium">
                      Qualification Match 44
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Teams: 7777, 8888, 9999 vs 1010, 2020, 3030
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">In 35 min</Badge>
                  <Button size="sm" variant="secondary">
                    Scout
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="text-lg">Pit Scouting</CardTitle>
              <CardDescription>
                Document team capabilities before matches
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="text-lg">View Analytics</CardTitle>
              <CardDescription>
                Review collected data and team insights
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default DemoDashboard;
