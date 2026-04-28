import { useState, useEffect } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2 } from "lucide-react";
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
  const { supported, subscribed, loading, permission, error, toggleNotifications } =
    usePushNotifications();
  const [recording, setRecording] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") { setRecording(null); return; }
      if (e.key.length === 1) {
        updateSetting(recording, e.key.toLowerCase());
        setRecording(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [recording, updateSetting]);

  const userName = user?.user_metadata?.name || "";
  const email = user?.email || "";

  const handleNotificationToggle = async (fieldId: string, checked: boolean) => {
    console.log("handleNotificationToggle called:", { fieldId, checked, subscribed });

    if (checked && !subscribed) {
      console.log("Attempting to subscribe to push notifications...");
      // First notification toggle turned on — subscribe to push
      const success = await toggleNotifications(true);
      console.log("toggleNotifications result:", success);
      if (!success) {
        console.error("Failed to toggle notifications");
        return; // Permission denied or error
      }
    }

    updateSetting(fieldId, checked);

    // If both notification settings are off, unsubscribe
    if (!checked) {
      const otherNotifFields = NOTIFICATION_FIELD_IDS.filter((id) => id !== fieldId);
      const allOff = otherNotifFields.every((id) => !settings[id]);
      if (allOff) {
        console.log("All notifications off, unsubscribing...");
        await toggleNotifications(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background my-15">
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
              {key === "notifications" && (
                <div className="space-y-3">
                  {/* Push Notification Status */}
                  <div className="rounded-lg border p-3 bg-muted/50">
                    <p className="text-sm font-medium mb-1">
                      Push Notification Status
                    </p>
                    {!supported ? (
                      <p className="text-sm text-muted-foreground">
                        ❌ Not supported in this browser. Try Chrome, Firefox, or Edge.
                      </p>
                    ) : loading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Setting up push notifications...</span>
                      </div>
                    ) : permission === "denied" ? (
                      <p className="text-sm text-destructive">
                        ❌ Permission denied
                      </p>
                    ) : subscribed ? (
                      <p className="text-sm text-green-600 dark:text-green-400">
                        🟢 Active - You'll receive push notifications
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        🔴 Not subscribed - Toggle a notification below to enable
                      </p>
                    )}
                  </div>

                  {/* Error Message */}
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {/* Permission Denied Instructions */}
                  {permission === "denied" && (
                    <Alert>
                      <AlertDescription>
                        <strong>To enable notifications:</strong>
                        <br />• <strong>Chrome:</strong> Settings → Privacy and security → Site Settings → Notifications
                        <br />• <strong>Firefox:</strong> Page Info → Permissions → Receive Notifications
                        <br />• <strong>Edge:</strong> Settings → Cookies and site permissions → Notifications
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
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

                if (field.type === "select") {
                  const current = (settings[field.id] ?? field.defaultValue) as string;
                  return (
                    <div key={field.id} className="space-y-2">
                      <Label>{field.label}</Label>
                      {field.description && (
                        <p className="text-sm text-muted-foreground">{field.description}</p>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        {field.options.map((opt: { value: string; label: string }) => (
                          <button
                            key={opt.value}
                            onClick={() => updateSetting(field.id, opt.value)}
                            className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors
                              ${current === opt.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-muted text-foreground hover:bg-muted/70"
                              }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (field.type === "keybind") {
                  const isRecording = recording === field.id;
                  const currentKey = (settings[field.id] ?? field.defaultValue) as string;
                  return (
                    <div key={field.id} className="flex items-center justify-between">
                      <Label>{field.label}</Label>
                      <button
                        className={`w-10 h-8 text-sm font-mono font-bold rounded border transition-colors
                          ${isRecording
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-muted hover:bg-muted/80 text-foreground"
                          }`}
                        onClick={() => setRecording(isRecording ? null : field.id)}
                      >
                        {isRecording ? "…" : currentKey.toUpperCase()}
                      </button>
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
