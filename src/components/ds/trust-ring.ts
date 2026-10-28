import type { TrustLevel as ApiTrustLevel } from "@/api/types";

/** Вид кольца верификации вокруг аватара. */
export type AvatarTrust = "none" | "verified" | "video" | "special";

export function avatarIndicators(online: boolean, trust?: AvatarTrust, verified = false) {
  return {
    trustRing: Boolean(trust) && !online,
    badge: (verified && !trust) || (online && Boolean(trust && trust !== "none")),
  };
}

export const trustRingLabel: Record<AvatarTrust, string | null> = {
  none: null,
  verified: "Проверенный участник",
  video: "Видеоверификация",
  special: "Особый статус",
};

/**
 * Уровень кольца по уже существующим данным профиля.
 * special — trustLevel "ambassador"; video — trust.videoVerified, verification "verified"
 * или trustLevel "verified"; verified — trustLevel "trusted" (розовый щит). Приоритет: special, video, verified.
 */
export function getTrustLevel(profile: {
  trustLevel?: ApiTrustLevel | null;
  trust?: { videoVerified?: boolean } | null;
  verification?: string | null;
} | null | undefined): AvatarTrust {
  if (!profile) return "none";
  if (profile.trustLevel === "ambassador") return "special";
  if (
    profile.trust?.videoVerified === true ||
    profile.verification === "verified" ||
    profile.trustLevel === "verified"
  )
    return "video";
  if (profile.trustLevel === "trusted") return "verified";
  return "none";
}
