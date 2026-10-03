"use client";

import { useAuth } from "@/components/AuthProvider";
import AccountSwitch from "@/components/AccountSwitch";

// The Account tab's switch for leaving the admin metrics. Turning it on
// deletes the member's existing activity rows on the server; Luke's letter
// points members here by this label.
export default function MetricsSettings() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <AccountSwitch
      field="exclude_from_metrics"
      initial={user.exclude_from_metrics === true}
      label="Leave me out of activity counts"
      description="Your visits and time in the world won't be counted. Posts, comments, and letters are part of the site and still show in totals."
      onText="You're out of the activity counts."
      offText="You're back in the counts."
    />
  );
}
