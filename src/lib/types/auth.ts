export interface User {
  id: string;
  username: string;
  display_name: string;
  email: string;
  phone: string;
  password_hash?: string;
  bio: string;
  avatar_color: string;
  is_verified: number;
  verification_code: string | null;
  verification_expires_at: string | null;
  reset_code: string | null;
  reset_code_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_color: string;
  is_verified: number;
  created_at: string;
}

export interface AuthPayload {
  userId: string;
  username: string;
  is_verified: number;
}

export const AVATAR_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
] as const;
