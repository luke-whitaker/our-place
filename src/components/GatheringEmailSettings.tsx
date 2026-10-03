"use client";

import { useAuth } from "@/components/AuthProvider";
import AccountSwitch from "@/components/AccountSwitch";

// The Account tab's switch for gathering emails. The unsubscribe link in
// every gathering email turns off the same setting.
export default function GatheringEmailSettings() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <AccountSwitch
      field="email_gatherings"
      initial={user.email_gatherings !== false}
      label="Email me about gatherings"
      description="An email when you're invited to a gathering, when its time changes, and when it's cancelled. Your notifications here show all of it either way."
      onText="Gathering emails are on."
      offText="Gathering emails are off."
    />
  );
}
