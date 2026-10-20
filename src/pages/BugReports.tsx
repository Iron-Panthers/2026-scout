import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import CosmeticAvatar from "@/components/CosmeticAvatar";
import { BugReportInbox } from "@/components/BugReportInbox";
import { useAuth } from "@/contexts/AuthContext";
import { useMessages } from "@/contexts/MessagesContext";
import { BUG_INBOX_KEY, bugReportIdFromKey, bugReportKey } from "@/lib/bugReports";
import { initialsOf } from "@/lib/messages";

/**
 * Bug Reporting, on its own page (opened from the bug tab under the floating chat button):
 * the shared inbox of reports, and one report at a time with its comments. `?report=<id>`
 * opens a report.
 */
export default function BugReports() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const userId = user?.id ?? null;
  const isDeveloper = !!profile?.is_developer;
  const { contacts, setOpenConversation, bugReports } = useMessages();
  const [searchParams, setSearchParams] = useSearchParams();
  const reportId = searchParams.get("report");
  const openKey = reportId ? bugReportKey(reportId) : BUG_INBOX_KEY;

  // The open report doesn't pop in-app notifications
  useEffect(() => {
    setOpenConversation(reportId ? openKey : null);
    return () => setOpenConversation(null);
  }, [reportId, openKey, setOpenConversation]);

  const open = (key: string) => {
    const id = bugReportIdFromKey(key);
    setSearchParams(id ? { report: id } : {}, { replace: true });
  };

  const nameOf = (id: string | null) =>
    id === userId ? "You" : contacts.find((contact) => contact.id === id)?.name ?? "Unknown";
  const avatarOf = (id: string) => {
    const name = id === userId ? profile?.name || "You" : nameOf(id);
    const avatarUrl = id === userId ? profile?.avatar_url : contacts.find((contact) => contact.id === id)?.avatar_url;
    return <CosmeticAvatar avatarUrl={avatarUrl} initials={initialsOf(name)} size="sm" className="shrink-0" />;
  };

  return (
    <div className="min-h-screen bg-background my-5">
      <main className="container mx-auto flex h-[calc(100dvh-2.5rem)] max-w-3xl flex-col p-6">
        <div className="mb-4 flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Bug Reporting</h1>
        </div>

        {userId && (
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card p-3 [&>*]:flex-1">
            <BugReportInbox
              openKey={openKey}
              onOpen={open}
              onBack={() => navigate("/dashboard")}
              userId={userId}
              isDeveloper={isDeveloper}
              nameOf={nameOf}
              avatarOf={avatarOf}
              bugReports={bugReports}
            />
          </div>
        )}
      </main>
    </div>
  );
}
