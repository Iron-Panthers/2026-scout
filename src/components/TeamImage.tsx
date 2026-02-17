import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { getTeamPhotoFromPitScouting } from "@/lib/pitScouting";
import { getTeamPhoto, CURRENT_YEAR } from "@/lib/blueAlliance";

interface TeamImageProps {
  teamNumber: number;
  eventId?: string;
  className?: string;
  fallbackClassName?: string;
}

/**
 * TeamImage component that displays a team's robot photo.
 * Priority:
 * 1. Photo from pit scouting submissions (if eventId provided)
 * 2. Photo from The Blue Alliance API
 * 3. Placeholder with team number
 */
export function TeamImage({
  teamNumber,
  eventId,
  className = "w-full h-full object-cover",
  fallbackClassName = "w-full h-full flex items-center justify-center bg-muted",
}: TeamImageProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const verifyImageExists = (url: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });
    };

    const loadPhoto = async () => {
      setLoading(true);
      setError(false);
      setPhotoUrl(null);

      try {
        // Try pit scouting photo first (if eventId provided)
        if (eventId) {
          const pitPhoto = await getTeamPhotoFromPitScouting(
            teamNumber,
            eventId
          );
          if (mounted && pitPhoto) {
            // Verify the image actually exists before using it
            const exists = await verifyImageExists(pitPhoto);
            if (exists && mounted) {
              setPhotoUrl(pitPhoto);
              setLoading(false);
              return;
            }
            // If image doesn't exist, continue to TBA fallback
          }
        }

        // Fall back to TBA photo
        const tbaPhoto = await getTeamPhoto(teamNumber, CURRENT_YEAR);
        if (mounted && tbaPhoto) {
          setPhotoUrl(tbaPhoto);
        } else if (mounted) {
          setError(true);
        }
      } catch (err) {
        console.error("Failed to load team photo:", err);
        if (mounted) {
          setError(true);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadPhoto();

    return () => {
      mounted = false;
    };
  }, [teamNumber, eventId]);

  if (loading) {
    return (
      <div className={fallbackClassName}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !photoUrl) {
    return (
      <div className={fallbackClassName}>
        <div className="text-center">
          <p className="text-6xl font-bold text-muted-foreground">
            {teamNumber}
          </p>
          <p className="text-sm text-muted-foreground mt-2">No Photo</p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={photoUrl}
      alt={`Team ${teamNumber} Robot`}
      className={className}
      onError={() => {
        console.error("Failed to load image:", photoUrl);
        setError(true);
      }}
    />
  );
}
