// Dev screen jst for debugging

import { getAllData, updateProfile } from "@/lib/profiles";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export default function Dev() {
  const fetchProfiles = async () => {
    const profiles = await getAllData();
    console.log("All profiles:", profiles);
  };

  const { user: authUser, profile } = useAuth();

  const userName =
    profile?.name ||
    authUser?.user_metadata?.name ||
    authUser?.email?.split("@")[0] ||
    "User";

  const makeManager = async () => {
    updateProfile(authUser!.id, { is_manager: true });
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Dev Page</h1>
      <p>You are {userName}</p>
      <Button
        onClick={fetchProfiles}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        Fetch All Profiles
      </Button>
      <Button
        onClick={makeManager}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        {profile?.is_manager ? "Already manager" : "Make manager"}
      </Button>
    </div>
  );
}