-- New bug reports no longer send push notifications (to developers). Comments on a
-- report and a report being marked fixed still do, via the other on_bug_report_* triggers.
DROP TRIGGER IF EXISTS on_bug_report_filed ON bug_reports;
