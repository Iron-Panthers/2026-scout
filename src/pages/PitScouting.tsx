import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getActiveEvent } from "@/lib/matches";
import { pitScoutingQuestions } from "@/config/pitScoutingConfig";
import type { PitScoutingQuestion } from "@/config/pitScoutingConfig";
import type { Event } from "@/types";
import { PhotoUpload } from "@/components/PhotoUpload";
import { uploadPitPhoto } from "@/lib/photoUpload";
import {
  submitPitScouting,
  hasExistingPitScouting,
} from "@/lib/pitScouting";

export default function PitScouting() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [scouterName, setScouterName] = useState("");
  const [teamNumber, setTeamNumber] = useState("");
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadActiveEvent = async () => {
      const event = await getActiveEvent();
      setActiveEvent(event);
      setLoadingEvent(false);
    };
    loadActiveEvent();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!activeEvent) {
      toast({
        title: "Error",
        description: "No active event found",
        variant: "destructive",
      });
      return;
    }

    if (!scouterName.trim()) {
      toast({
        title: "Error",
        description: "Please enter your name",
        variant: "destructive",
      });
      return;
    }

    if (!teamNumber || Number(teamNumber) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid team number",
        variant: "destructive",
      });
      return;
    }

    // Validate required questions that need explicit JS checks (checkbox/radio)
    for (const question of pitScoutingQuestions) {
      if (!question.required) continue;
      if (question.type === "checkbox") {
        const selected = formData[question.id];
        if (!selected || selected.length === 0) {
          toast({
            title: "Required field",
            description: `Please select at least one option for: "${question.label}"`,
            variant: "destructive",
          });
          return;
        }
      } else if (question.type === "radio") {
        if (!formData[question.id]) {
          toast({
            title: "Required field",
            description: `Please select an option for: "${question.label}"`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    setIsSubmitting(true);

    try {
      // Check for duplicate submission
      if (user?.id) {
        const exists = await hasExistingPitScouting(
          Number(teamNumber),
          activeEvent.id,
          user.id
        );
        if (exists) {
          throw new Error(
            `You have already submitted pit scouting for team ${teamNumber} at this event`
          );
        }
      }

      // Upload photo (optional - only if provided)
      let photoUrls: string[] = [];
      if (photo && user?.id) {
        try {
          const { publicUrl } = await uploadPitPhoto(
            photo,
            user.id,
            activeEvent.event_code || "",
            Number(teamNumber)
          );
          photoUrls = [publicUrl];
        } catch (photoError) {
          console.error("Photo upload failed:", photoError);
          throw new Error(
            `Photo upload failed: ${photoError instanceof Error ? photoError.message : "Unknown error"}`
          );
        }
      }

      // Submit to database
      await submitPitScouting(
        Number(teamNumber),
        activeEvent.id,
        user?.id || "",
        scouterName,
        formData,
        photoUrls
      );

      // Success feedback
      toast({
        title: "Success",
        description: "Pit scouting submitted successfully",
      });

      navigate(-1);
    } catch (error) {
      console.error("Submission error:", error);
      toast({
        title: "Submission failed",
        description:
          error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (id: string, value: any) => {
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleCheckboxChange = (
    id: string,
    option: string,
    checked: boolean
  ) => {
    const current = formData[id] || [];
    const updated = checked
      ? [...current, option]
      : current.filter((item: string) => item !== option);
    handleInputChange(id, updated);
  };

  const renderQuestion = (question: PitScoutingQuestion) => {
    switch (question.type) {
      case "text":
        return (
          <div key={question.id} className="space-y-2">
            <Label htmlFor={question.id}>
              {question.label}
              {question.required && (
                <span className="text-destructive ml-1">*</span>
              )}
            </Label>
            <Input
              id={question.id}
              placeholder={question.placeholder}
              value={formData[question.id] || ""}
              onChange={(e) => handleInputChange(question.id, e.target.value)}
              required={question.required}
              disabled={isSubmitting}
            />
          </div>
        );

      case "textarea":
        return (
          <div key={question.id} className="space-y-2">
            <Label htmlFor={question.id}>
              {question.label}
              {question.required && (
                <span className="text-destructive ml-1">*</span>
              )}
            </Label>
            <Textarea
              id={question.id}
              placeholder={question.placeholder}
              value={formData[question.id] || ""}
              onChange={(e) => handleInputChange(question.id, e.target.value)}
              required={question.required}
              rows={4}
              disabled={isSubmitting}
            />
          </div>
        );

      case "radio":
        return (
          <div key={question.id} className="space-y-3">
            <Label>
              {question.label}
              {question.required && (
                <span className="text-destructive ml-1">*</span>
              )}
            </Label>
            <RadioGroup
              value={formData[question.id] || ""}
              onValueChange={(value) => handleInputChange(question.id, value)}
              required={question.required}
              disabled={isSubmitting}
            >
              {question.options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={option}
                    id={`${question.id}-${option}`}
                    disabled={isSubmitting}
                  />
                  <Label
                    htmlFor={`${question.id}-${option}`}
                    className="font-normal cursor-pointer"
                  >
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );

      case "checkbox":
        return (
          <div key={question.id} className="space-y-3">
            <Label>
              {question.label}
              {question.required && (
                <span className="text-destructive ml-1">*</span>
              )}
            </Label>
            <div className="space-y-2">
              {question.options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${question.id}-${option}`}
                    checked={(formData[question.id] || []).includes(option)}
                    onCheckedChange={(checked) =>
                      handleCheckboxChange(
                        question.id,
                        option,
                        checked as boolean
                      )
                    }
                    disabled={isSubmitting}
                  />
                  <Label
                    htmlFor={`${question.id}-${option}`}
                    className="font-normal cursor-pointer"
                  >
                    {option}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        );

      case "select":
        return (
          <div key={question.id} className="space-y-2">
            <Label htmlFor={question.id}>
              {question.label}
              {question.required && (
                <span className="text-destructive ml-1">*</span>
              )}
            </Label>
            <Select
              value={formData[question.id] || ""}
              onValueChange={(value) => handleInputChange(question.id, value)}
              required={question.required}
              disabled={isSubmitting}
            >
              <SelectTrigger id={question.id}>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {question.options?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto p-6 max-w-4xl">
        {/* Back Button */}
        <Button variant="ghost" className="mb-6" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {/* Page Title */}
        <h1 className="text-4xl font-bold mb-8">
          <span className="text-primary">Pit</span> Scouting
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Event Map */}
          <Card>
            <CardHeader>
              <CardTitle>{activeEvent?.name || "Event"} Map</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingEvent ? (
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border-2 border-border">
                  <p className="text-muted-foreground">Loading map...</p>
                </div>
              ) : activeEvent?.scouting_map_url ? (
                <div className="aspect-video bg-muted rounded-lg overflow-hidden border-2 border-border">
                  <img
                    src={activeEvent.scouting_map_url}
                    alt="Event Scouting Map"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.parentElement!.innerHTML = `
                        <div class="flex items-center justify-center h-full">
                          <p class="text-muted-foreground">Failed to load map</p>
                        </div>
                      `;
                    }}
                  />
                </div>
              ) : (
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-border">
                  <p className="text-muted-foreground">
                    No scouting map available
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scouter Information */}
          <Card>
            <CardHeader>
              <CardTitle>Scouter Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="scouter-name">
                  Your Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="scouter-name"
                  placeholder="Enter your name"
                  value={scouterName}
                  onChange={(e) => setScouterName(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-number">
                  Team Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="team-number"
                  type="number"
                  placeholder="e.g., 5026"
                  value={teamNumber}
                  onChange={(e) => setTeamNumber(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </CardContent>
          </Card>

          {/* Robot Photo */}
          <Card>
            <CardHeader>
              <CardTitle>Robot Photo</CardTitle>
            </CardHeader>
            <CardContent>
              <PhotoUpload
                onPhotoSelected={setPhoto}
                onPhotoCleared={() => setPhoto(null)}
                disabled={isSubmitting}
              />
            </CardContent>
          </Card>

          {/* Pit Scouting Questions */}
          <Card>
            <CardHeader>
              <CardTitle>Robot & Team Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {pitScoutingQuestions.map(renderQuestion)}
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Pit Scouting Report"
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
