export const SHOUTOUT_BADGES = [
  { key: "thanks", label: "Thank you", emoji: "💛" },
  { key: "above", label: "Above & beyond", emoji: "🚀" },
  { key: "teamwork", label: "Teamwork", emoji: "🤝" },
  { key: "creative", label: "Creativity", emoji: "🎨" },
  { key: "leader", label: "Leadership", emoji: "⭐" },
  { key: "kindness", label: "Kindness", emoji: "🫶" },
] as const;
export const badgeOf = (key: string) => SHOUTOUT_BADGES.find((b) => b.key === key) ?? SHOUTOUT_BADGES[0];
