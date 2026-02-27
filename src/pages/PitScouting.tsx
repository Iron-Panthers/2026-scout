import { useState, useEffect, useRef } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getActiveEvent } from "@/lib/matches";
import { pitScoutingQuestions } from "@/config/pitScoutingConfig";
import type { PitScoutingQuestion } from "@/config/pitScoutingConfig";
import type { Event } from "@/types";
import type { PitScoutingSubmission } from "@/types/pitScouting";
import { PhotoUpload } from "@/components/PhotoUpload";
import { RecursiveJsonEditor } from "@/components/RecursiveJsonEditor";
import { uploadPitPhoto } from "@/lib/photoUpload";
import {
  submitPitScouting,
  hasExistingPitScouting,
  updatePitScouting,
  getPitScoutingForTeamAtEvent,
} from "@/lib/pitScouting";

export default function PitScouting() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const rescoutMode = searchParams.get("rescout") === "true";

  // Shared state
  const [scouterName, setScouterName] = useState("");
  const [teamNumber, setTeamNumber] = useState("");
  const [teamNumberLocked, setTeamNumberLocked] = useState(false);
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Normal mode state
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);

  // Rescout mode state
  const [existingSubmission, setExistingSubmission] =
    useState<PitScoutingSubmission | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [pitDataEdit, setPitDataEdit] = useState<Record<string, any>>({});
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [replacePhoto, setReplacePhoto] = useState(false);

  // Debounce ref for duplicate check
  const duplicateCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loadActiveEvent = async () => {
      const event = await getActiveEvent();
      setActiveEvent(event);
      setLoadingEvent(false);
    };
    loadActiveEvent();
  }, []);

  // Auto-fill from URL params
  useEffect(() => {
    const teamParam = searchParams.get("team");
    if (teamParam) {
      setTeamNumber(teamParam);
      setTeamNumberLocked(true);
    }
    const name = profile?.name || user?.user_metadata?.name;
    if (name) {
      setScouterName(name);
    }
  }, [searchParams, user, profile]);

  // Auto-redirect to rescout mode when team is locked and already has data
  useEffect(() => {
    if (rescoutMode || !teamNumberLocked || !teamNumber || !activeEvent) return;
    const teamNum = Number(teamNumber);
    if (!teamNum || teamNum <= 0) return;

    getPitScoutingForTeamAtEvent(teamNum, activeEvent.id).then((sub) => {
      if (sub) {
        navigate(`/pit-scouting?team=${teamNumber}&rescout=true`, { replace: true });
      }
    });
  }, [rescoutMode, teamNumberLocked, teamNumber, activeEvent, navigate]);

  // Load existing submission in rescout mode
  useEffect(() => {
    if (!rescoutMode || !teamNumber || !activeEvent) return;
    const teamNum = Number(teamNumber);
    if (!teamNum || teamNum <= 0) return;

    setLoadingExisting(true);
    getPitScoutingForTeamAtEvent(teamNum, activeEvent.id).then((sub) => {
      setExistingSubmission(sub);
      if (sub?.pit_data) {
        setPitDataEdit({ ...sub.pit_data });
      }
      setLoadingExisting(false);
    });
  }, [rescoutMode, teamNumber, activeEvent]);

  // Duplicate detection for normal mode (debounced)
  useEffect(() => {
    if (rescoutMode || !activeEvent || teamNumberLocked) return;
    const teamNum = Number(teamNumber);
    if (!teamNum || teamNum <= 0) return;

    if (duplicateCheckTimer.current) clearTimeout(duplicateCheckTimer.current);
    duplicateCheckTimer.current = setTimeout(async () => {
      const existing = await getPitScoutingForTeamAtEvent(teamNum, activeEvent.id);
      if (existing) {
        setDuplicateDialogOpen(true);
      }
    }, 600);

    return () => {
      if (duplicateCheckTimer.current) clearTimeout(duplicateCheckTimer.current);
    };
  }, [teamNumber, activeEvent, rescoutMode, teamNumberLocked]);

  // ---- Normal mode submit ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeEvent) {
      toast({ title: "Error", description: "No active event found", variant: "destructive" });
      return;
    }
    if (!scouterName.trim()) {
      toast({ title: "Error", description: "Please enter your name", variant: "destructive" });
      return;
    }
    if (!teamNumber || Number(teamNumber) <= 0) {
      toast({ title: "Error", description: "Please enter a valid team number", variant: "destructive" });
      return;
    }

    for (const question of pitScoutingQuestions) {
      if (!question.required) continue;
      if (question.type === "checkbox") {
        const selected = formData[question.id];
        if (!selected || selected.length === 0) {
          toast({ title: "Required field", description: `Please select at least one option for: "${question.label}"`, variant: "destructive" });
          return;
        }
      } else if (question.type === "radio") {
        if (!formData[question.id]) {
          toast({ title: "Required field", description: `Please select an option for: "${question.label}"`, variant: "destructive" });
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      if (user?.id) {
        const exists = await hasExistingPitScouting(Number(teamNumber), activeEvent.id, user.id);
        if (exists) {
          throw new Error(`You have already submitted pit scouting for team ${teamNumber} at this event`);
        }
      }

      let photoUrl: string | null = null;
      if (photo && user?.id) {
        const { publicUrl } = await uploadPitPhoto(photo, user.id, activeEvent.event_code || "", Number(teamNumber));
        photoUrl = publicUrl;
      }

      await submitPitScouting(Number(teamNumber), activeEvent.id, user?.id || "", scouterName, formData, photoUrl);
      toast({ title: "Success", description: "Pit scouting submitted successfully" });
      navigate("/dashboard");
    } catch (error) {
      toast({ title: "Submission failed", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Rescout mode submit ----
  const handleRescoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingSubmission) {
      toast({ title: "Error", description: "No existing submission found to update", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      let photoUrl = existingSubmission.photo_url;

      if (newPhoto && user?.id) {
        const { publicUrl } = await uploadPitPhoto(newPhoto, user.id, activeEvent?.event_code || "", Number(teamNumber));
        photoUrl = publicUrl;
      }

      await updatePitScouting(existingSubmission.id, {
        pit_data: pitDataEdit,
        photo_url: photoUrl,
        scouter_name: scouterName,
      });

      toast({ title: "Success", description: "Pit scouting updated successfully" });
      navigate("/dashboard");
    } catch (error) {
      toast({ title: "Update failed", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (id: string, value: any) => {
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleCheckboxChange = (id: string, option: string, checked: boolean) => {
    const current = formData[id] || [];
    const updated = checked ? [...current, option] : current.filter((item: string) => item !== option);
    handleInputChange(id, updated);
  };

  const renderQuestion = (question: PitScoutingQuestion) => {
    switch (question.type) {
      case "text":
        return (
          <div key={question.id} className="space-y-2">
            <Label htmlFor={question.id}>
              {question.label}
              {question.required && <span className="text-destructive ml-1">*</span>}
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
              {question.required && <span className="text-destructive ml-1">*</span>}
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
              {question.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <RadioGroup
              value={formData[question.id] || ""}
              onValueChange={(value) => handleInputChange(question.id, value)}
              required={question.required}
              disabled={isSubmitting}
            >
              {question.options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <RadioGroupItem value={option} id={`${question.id}-${option}`} disabled={isSubmitting} />
                  <Label htmlFor={`${question.id}-${option}`} className="font-normal cursor-pointer">
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
              {question.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="space-y-2">
              {question.options?.map((option) => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${question.id}-${option}`}
                    checked={(formData[question.id] || []).includes(option)}
                    onCheckedChange={(checked) => handleCheckboxChange(question.id, option, checked as boolean)}
                    disabled={isSubmitting}
                  />
                  <Label htmlFor={`${question.id}-${option}`} className="font-normal cursor-pointer">
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
              {question.required && <span className="text-destructive ml-1">*</span>}
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

  const eventMapCard = (
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
                e.currentTarget.parentElement!.innerHTML = `<div class="flex items-center justify-center h-full"><p class="text-muted-foreground">Failed to load map</p></div>`;
              }}
            />
          </div>
        ) : (
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-border">
            <p className="text-muted-foreground">No scouting map available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto p-6 max-w-4xl">
        <Button variant="ghost" className="mb-6" onClick={() => navigate(rescoutMode ? "/dashboard" : -1 as any)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <h1 className="text-4xl font-bold mb-8">
          {rescoutMode ? (
            <>
              <span className="text-yellow-400">Update</span> Pit Scouting
              {teamNumber && <span className="text-muted-foreground text-2xl ml-3">— Team {teamNumber}</span>}
            </>
          ) : (
            <>
              <span className="text-primary">Pit</span> Scouting
            </>
          )}
        </h1>

        {/* ---- RESCOUT MODE ---- */}
        {rescoutMode ? (
          <form onSubmit={handleRescoutSubmit} className="space-y-6">
            {eventMapCard}

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
                  <Label>
                    Team Number
                    <span className="ml-2 text-xs text-muted-foreground">(pre-filled from assignment)</span>
                  </Label>
                  <Input value={teamNumber} readOnly disabled className="font-mono" />
                </div>
              </CardContent>
            </Card>

            {/* Photo section */}
            <Card>
              <CardHeader>
                <CardTitle>Robot Photo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingExisting ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading existing data...
                  </div>
                ) : existingSubmission?.photo_url && !replacePhoto ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Current photo:</p>
                    <div className="aspect-video bg-muted rounded-lg overflow-hidden border-2 border-border">
                      <img
                        src={existingSubmission.photo_url}
                        alt="Current robot photo"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setReplacePhoto(true)}
                      disabled={isSubmitting}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Replace Photo
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {replacePhoto && (
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">Select a new photo:</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => { setReplacePhoto(false); setNewPhoto(null); }}
                          disabled={isSubmitting}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                    <PhotoUpload
                      onPhotoSelected={setNewPhoto}
                      onPhotoCleared={() => setNewPhoto(null)}
                      disabled={isSubmitting}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Data editor */}
            <Card>
              <CardHeader>
                <CardTitle>Robot & Team Information</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingExisting ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading existing data...
                  </div>
                ) : !existingSubmission ? (
                  <p className="text-muted-foreground text-sm">
                    No existing submission found for team {teamNumber}. Make sure the team number and active event are correct.
                  </p>
                ) : (
                  <RecursiveJsonEditor
                    value={pitDataEdit}
                    onChange={(val) => setPitDataEdit(val as Record<string, any>)}
                  />
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => navigate("/dashboard")} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={isSubmitting || !existingSubmission}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Updates"
                )}
              </Button>
            </div>
          </form>
        ) : (
          /* ---- NORMAL MODE ---- */
          <form onSubmit={handleSubmit} className="space-y-6">
            {eventMapCard}

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
                    {teamNumberLocked && (
                      <span className="ml-2 text-xs text-muted-foreground">(pre-filled from assignment)</span>
                    )}
                  </Label>
                  <Input
                    id="team-number"
                    type="number"
                    placeholder="e.g., 5026"
                    value={teamNumber}
                    onChange={(e) => setTeamNumber(e.target.value)}
                    required
                    disabled={isSubmitting || teamNumberLocked}
                    readOnly={teamNumberLocked}
                  />
                </div>
              </CardContent>
            </Card>

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

            <Card>
              <CardHeader>
                <CardTitle>Robot & Team Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {pitScoutingQuestions.map(renderQuestion)}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={isSubmitting}>
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
        )}

        {/* Duplicate detection dialog (normal mode only) */}
        <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Team Already Scouted</DialogTitle>
              <DialogDescription>
                Team {teamNumber} already has pit scouting data for this event. You can edit the existing entry, or clear the team number to enter a different team.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setTeamNumber("");
                  setDuplicateDialogOpen(false);
                }}
              >
                Clear Team Number
              </Button>
              <Button
                onClick={() => {
                  setDuplicateDialogOpen(false);
                  navigate(`/pit-scouting?team=${teamNumber}&rescout=true`);
                }}
              >
                Edit Existing Entry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
