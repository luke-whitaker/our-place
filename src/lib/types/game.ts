export interface AvatarConfig {
  hairStyle: "short" | "long";
  skinTone: string;
  shirtColor: string;
  pantsColor: string;
  shoesColor: string;
}

export const SKIN_TONES = [
  "#FFE0BD",
  "#F1C27D",
  "#C68642",
  "#8D5524",
  "#5C3836",
  "#3B2219",
] as const;

export const SHIRT_COLORS = [
  "#5c699f",
  "#ca5954",
  "#557d55",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
] as const;

export const PANTS_COLORS = ["#353540", "#1e3a5f", "#3b2219", "#4a5568", "#2d3748"] as const;

export const SHOES_COLORS = ["#4d3f38", "#353540", "#ca5954", "#ede4da", "#1e3a5f"] as const;

export const DEFAULT_AVATAR: AvatarConfig = {
  hairStyle: "short",
  skinTone: "#C68642",
  shirtColor: "#5c699f",
  pantsColor: "#353540",
  shoesColor: "#4d3f38",
};
