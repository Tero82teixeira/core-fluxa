export type PasswordRecoveryCredentials =
  | { kind: "pkce"; code: string }
  | { kind: "implicit"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string }
  | { kind: "session" };

export function readPasswordRecoveryCredentials(urlValue: string): PasswordRecoveryCredentials {
  const url = new URL(urlValue);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const error =
    url.searchParams.get("error_description") ||
    hash.get("error_description") ||
    url.searchParams.get("error") ||
    hash.get("error");

  if (error) return { kind: "error", message: error.replace(/\+/g, " ") };

  const code = url.searchParams.get("code");
  if (code) return { kind: "pkce", code };

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "implicit", accessToken, refreshToken };
  }

  return { kind: "session" };
}

export function cleanPasswordRecoveryUrl(urlValue: string) {
  const url = new URL(urlValue);
  for (const key of [
    "code",
    "error",
    "error_code",
    "error_description",
    "token",
    "token_hash",
    "type",
  ]) {
    url.searchParams.delete(key);
  }
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}
