import { Button } from "@/components/ui/button";
import { ClipboardList, Wrench } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import DashboardHeader from "@/components/DashboardHeader";
import OfflineMatches from "@/components/OfflineMatches";
import { prettifyRole } from "@/lib/roleUtils";
export { prettifyRole };

export default function GuestDashboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background my-5">
      {/* Main Content */}
      <main className="container mx-auto p-6 max-w-7xl">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-8">
          <DashboardHeader userName={"Guest"} />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          <Button
            size="lg"
            className="h-24 text-lg font-semibold flex flex-col gap-2"
            onClick={() => navigate("/config/?g=true")}
          >
            <ClipboardList className="h-8 w-8" />
            Match Scouting
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-24 text-lg font-semibold flex flex-col gap-2 items-center"
          >
            <Link to="/pit-scouting" className="flex flex-col items-center gap-2">
              <Wrench className="h-8 w-8" />
              Pit Scouting
            </Link>
          </Button>
          
        </div>

        {/* Offline Matches Section */}
        <div className="mb-8">
          <OfflineMatches />
        </div>
      </main>
    </div>
  );
}
