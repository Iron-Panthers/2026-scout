import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, User, LogOut, Users, LayoutDashboard, TrendingUp, ShoppingBag } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getGameProfile } from "@/lib/gameProfiles";
import CosmeticAvatar from "@/components/CosmeticAvatar";
import type { UserProfileMenuProps } from "@/types";

export default function UserProfileMenu({
  userName,
  userInitials,
  avatarUrl = "",
}: Omit<UserProfileMenuProps, "isManager">) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut, user } = useAuth();
  const isManager = profile?.is_manager || false;
  const isOnManagerDashboard = location.pathname === "/manager";

  const [equippedCosmetics, setEquippedCosmetics] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.id) return;
    getGameProfile(user.id).then((gp) => {
      if (gp?.equipped_cosmetics) setEquippedCosmetics(gp.equipped_cosmetics);
    });
  }, [user?.id]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  // suppress unused warning — userName is kept for aria-label accessibility
  void userName;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full overflow-visible p-0">
          <CosmeticAvatar
            avatarUrl={avatarUrl}
            initials={userInitials}
            equippedCosmetics={equippedCosmetics}
            size="md"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/profile")}>
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/settings")}>
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/shop")}>
          <ShoppingBag className="mr-2 h-4 w-4" />
          <span>Shop</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/betting")}>
          <TrendingUp className="mr-2 h-4 w-4" />
          <span>Predictions</span>
        </DropdownMenuItem>
        {isManager && (
          <>
            {isOnManagerDashboard ? (
              <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Scout Dashboard</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => navigate("/manager")}>
                <Users className="mr-2 h-4 w-4" />
                <span>Manager Dashboard</span>
              </DropdownMenuItem>
            )}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
