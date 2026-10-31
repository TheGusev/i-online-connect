export function hasVerifiedContact(user: { phone_verified?: boolean; email_verified?: boolean; provider_verified?: boolean } | null | undefined) {
  return Boolean(user && (user.phone_verified || user.email_verified || user.provider_verified));
}

export const verifiedContactSql = `u.phone_verified, u.email_verified,
  EXISTS(SELECT 1 FROM user_identities i WHERE i.user_id=u.id AND i.provider IN ('yandex','telegram')) AS provider_verified`;