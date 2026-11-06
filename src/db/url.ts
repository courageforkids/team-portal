/**
 * Returns the database URL. If it still contains Supabase's [YOUR-PASSWORD] placeholder,
 * the password from DATABASE_PASSWORD is inserted (safely encoded) so nobody has to edit the URL by hand.
 */
export function databaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? "";
  const pw = process.env.DATABASE_PASSWORD;
  if (!pw) return raw;
  return raw.replace(/%5BYOUR-PASSWORD%5D|\[YOUR-PASSWORD\]/gi, encodeURIComponent(pw));
}
