import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import settingsConfig from "@/config/settings.json";

const NOTIFICATION_FIELD_IDS = ["match-notifications", "reminder-notifications"];

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings, updateSetting } = useSettings();
  const { supported, subscribed, loading, permission, toggleNotifications } =
    usePushNotifications();

  const userName = user?.user_metadata?.name || "";
  const email = user?.email || "";

  const handleNotificationToggle = async (fieldId: string, checked: boolean) => {
    if (checked && !subscribed) {
      // First notification toggle turned on — subscribe to push
      const success = await toggleNotifications(true);
      if (!success) return; // Permission denied or error
    }

    updateSetting(fieldId, checked);

    // If both notification settings are off, unsubscribe
    if (!checked) {
      const otherNotifFields = NOTIFICATION_FIELD_IDS.filter((id) => id !== fieldId);
      const allOff = otherNotifFields.every((id) => !settings[id]);
      if (allOff) {
        await toggleNotifications(false);
      }
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

        <h1 className="text-3xl font-bold mb-8">Settings</h1>

        {Object.entries(settingsConfig).map(([key, section]: [string, any]) => (
          <Card key={key} className="mb-6">
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {key === "notifications" && !supported && (
                <p className="text-sm text-muted-foreground">
                  Push notifications are not supported in this browser.
                </p>
              )}
              {key === "notifications" && permission === "denied" && (
                <p className="text-sm text-destructive">
                  Notification permission was denied. Please enable it in your
                  browser settings.
                </p>
              )}
              {section.fields.map((field: any) => {
                const isNotificationField = NOTIFICATION_FIELD_IDS.includes(field.id);

                if (field.type === "text" || field.type === "email") {
                  const value =
                    field.id === "name"
                      ? userName
                      : field.id === "email"
                      ? email
                      : settings[field.id] || field.defaultValue;
                  return (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={field.id}>{field.label}</Label>
                      <Input
                        id={field.id}
                        type={field.type}
                        defaultValue={value}
                        disabled={field.editable === false}
                        onChange={(e) =>
                          updateSetting(field.id, e.target.value)
                        }
                      />
                    </div>
                  );
                }

                if (field.type === "switch") {
                  return (
                    <div
                      key={field.id}
                      className="flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <Label htmlFor={field.id}>{field.label}</Label>
                        {field.description && (
                          <p className="text-sm text-muted-foreground">
                            {field.description}
                          </p>
                        )}
                      </div>
                      <Switch
                        id={field.id}
                        checked={settings[field.id] ?? field.defaultValue}
                        onCheckedChange={(checked) =>
                          isNotificationField
                            ? handleNotificationToggle(field.id, checked)
                            : updateSetting(field.id, checked)
                        }
                        disabled={
                          field.editable === false ||
                          (isNotificationField && (!supported || loading))
                        }
                      />
                    </div>
                  );
                }

                return null;
              })}
              {key === "account" && <Button>Save Changes</Button>}
            </CardContent>
          </Card>
        ))}

        {/* Danger Zone */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible actions that affect your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive">Delete Account</Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
