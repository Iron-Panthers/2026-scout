import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { getMatchTeam, CURRENT_YEAR } from "@/lib/blueAlliance";

interface RobotRating {
  teamNumber: number;
  speed: number; // 1-5
  fieldAwareness: number; // 1-5
}

export default function QualScouting() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const matchId = searchParams.get("match_id") || "";
  const role = searchParams.get("role") || ""; // qualRed or qualBlue
  const eventCode = searchParams.get("event_code") || "";
  const matchNumber = parseInt(searchParams.get("match_number") || "0");

  const [ratings, setRatings] = useState<RobotRating[]>([
    { teamNumber: 0, speed: 0, fieldAwareness: 0 },
    { teamNumber: 0, speed: 0, fieldAwareness: 0 },
    { teamNumber: 0, speed: 0, fieldAwareness: 0 },
  ]);
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [teamNumbersLoaded, setTeamNumbersLoaded] = useState(false);

  const alliance = role === "qualRed" ? "red" : "blue";
  const positions = ["1", "2", "3"];

  // Load team numbers from TBA
  useEffect(() => {
    const loadTeamNumbers = async () => {
      if (!eventCode || !matchNumber || teamNumbersLoaded) return;

      try {
        const newRatings = [...ratings];
        for (let i = 0; i < 3; i++) {
          const roleName = `${alliance}${i + 1}`;
          const teamNumber = await getMatchTeam(eventCode, matchNumber, roleName);
          if (teamNumber) {
            newRatings[i] = { ...newRatings[i], teamNumber };
          }
        }
        setRatings(newRatings);
        setTeamNumbersLoaded(true);
      } catch (error) {
        console.error("Failed to load team numbers:", error);
      }
    };

    loadTeamNumbers();
  }, [eventCode, matchNumber, alliance]);

  const updateRating = (index: number, field: "speed" | "fieldAwareness", value: number) => {
    const newRatings = [...ratings];
    newRatings[index] = { ...newRatings[index], [field]: value };
    setRatings(newRatings);
  };

  const canSubmit = () => {
    // All ratings must be set (1-5) and comments required
    return (
      ratings.every((r) => r.speed > 0 && r.fieldAwareness > 0) &&
      comments.trim() !== ""
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit()) {
      toast({
        title: "Incomplete Data",
        description: "Please rate all robots and add comments",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Prepare qual scouting data
      const qualData = {
        version: 1,
        alliance,
        ratings,
        comments,
        submittedAt: new Date().toISOString(),
      };

      // Submit to database
      const { error: submitError } = await supabase
        .from("scouting_submissions")
        .insert({
          match_id: matchId || null,
          match_number: matchNumber,
          event_code: eventCode,
          role: role,
          scouter_id: user?.id,
          data: qualData,
          schema_version: 1,
        });

      if (submitError) {
        throw submitError;
      }

      toast({
        title: "Success!",
        description: "Qual scouting submitted successfully",
      });

      navigate("/dashboard");
    } catch (error: any) {
      console.error("Submission error:", error);
      toast({
        title: "Submission Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const RatingSelector = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: number;
    onChange: (val: number) => void;
  }) => (
    <div className="space-y-2">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onChange(num)}
            className={`w-12 h-12 rounded-lg border-2 font-semibold transition-all ${
              value === num
                ? "bg-primary text-primary-foreground border-primary scale-110"
                : "bg-background border-border hover:border-primary/50"
            }`}
          >
            {num}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Slow/Poor</span>
        <span>Fast/Excellent</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen p-4 pb-24">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <div className="mt-4">
          <h1 className="text-2xl font-bold">Qual Scouting</h1>
          <p className="text-muted-foreground">
            Match {matchNumber} • {alliance === "red" ? "Red" : "Blue"} Alliance
          </p>
        </div>
      </div>

      {/* Ratings */}
      <div className="max-w-2xl mx-auto space-y-6">
        {ratings.map((rating, index) => (
          <div
            key={index}
            className={`p-6 rounded-lg border-2 ${
              alliance === "red" ? "border-red-500/30 bg-red-500/5" : "border-blue-500/30 bg-blue-500/5"
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`text-lg font-bold ${
                  alliance === "red" ? "text-red-500" : "text-blue-500"
                }`}
              >
                {alliance === "red" ? "Red" : "Blue"} {positions[index]}
              </div>
              {rating.teamNumber > 0 && (
                <div className="text-sm font-medium text-muted-foreground">
                  Team {rating.teamNumber}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <RatingSelector
                label="Speed"
                value={rating.speed}
                onChange={(val) => updateRating(index, "speed", val)}
              />
              <RatingSelector
                label="Field Awareness"
                value={rating.fieldAwareness}
                onChange={(val) => updateRating(index, "fieldAwareness", val)}
              />
            </div>
          </div>
        ))}

        {/* Comments */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Comments (Required)</label>
          <Textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Overall observations about the alliance performance..."
            className={`min-h-24 ${
              !comments.trim() ? "border-red-500" : ""
            }`}
          />
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit() || loading}
          size="lg"
          className="w-full h-16 text-lg"
        >
          {loading ? (
            "Submitting..."
          ) : (
            <>
              <Check className="mr-2 h-5 w-5" />
              Submit Qual Scouting
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
