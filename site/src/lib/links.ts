// The customer app lives on its own origin; the landing page only links to it.
export const APP_URL = import.meta.env.VITE_APP_URL ?? "http://localhost:3001";
export const SITE_URL =
  import.meta.env.VITE_SITE_URL ?? "http://localhost:3000";

export const SIGN_UP_URL = `${APP_URL}/signup`;
export const SIGN_IN_URL = `${APP_URL}/login`;
