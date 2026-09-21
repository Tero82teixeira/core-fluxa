type AnalyticsConsent = "accepted" | "rejected";

type AnalyticsProperty = string | number | boolean | null;

export type ProductAnalyticsEvent =
  | "account_signup_completed"
  | "client_created"
  | "confirmation_email_resent"
  | "diagnostic_quiz_completed"
  | "diagnostic_quiz_lead_submitted"
  | "diagnostic_quiz_started"
  | "diagnostic_quiz_trial_started"
  | "document_uploaded"
  | "organization_onboarding_completed"
  | "page_viewed"
  | "password_reset_requested"
  | "process_created"
  | "subscription_checkout_started"
  | "task_created"
  | "user_signed_in";

export type ProductAnalyticsProperties = Record<string, AnalyticsProperty | undefined>;

export const ANALYTICS_CONSENT_KEY = "fluxa:analytics-consent:v1";
export const ANALYTICS_CONSENT_EVENT = "fluxa:analytics-consent-changed";

const SENSITIVE_PROPERTY_PATTERN =
  /(^|_)(email|name|nome|phone|telefone|whatsapp|document|cpf|cnpj|password|senha|token|title|description|notes?|content|message|address|street)(_|$)/i;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const NUMERIC_SEGMENT = /^\d+$/;

let clientPromise: Promise<typeof import("posthog-js").default | null> | null = null;

function analyticsEnvironment() {
  const env = (
    import.meta as ImportMeta & {
      env?: Record<string, string | boolean | undefined>;
    }
  ).env;
  return {
    enabled: env?.PROD === true || env?.VITE_POSTHOG_ENABLE_DEV === "true",
    key: typeof env?.VITE_POSTHOG_KEY === "string" ? env.VITE_POSTHOG_KEY.trim() : "",
    host:
      typeof env?.VITE_POSTHOG_HOST === "string" && env.VITE_POSTHOG_HOST.trim()
        ? env.VITE_POSTHOG_HOST.trim()
        : "https://us.i.posthog.com",
  };
}

export function isProductAnalyticsConfigured() {
  const environment = analyticsEnvironment();
  return environment.enabled && Boolean(environment.key);
}

export function getAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return stored === "accepted" || stored === "rejected" ? stored : null;
  } catch {
    return null;
  }
}

export function setAnalyticsConsent(consent: AnalyticsConsent) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: consent }));
  if (consent === "accepted") {
    void initializeProductAnalytics().then((client) => client?.opt_in_capturing());
  } else void disableProductAnalytics();
}

export function normalizeAnalyticsPath(pathname: string): string {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      UUID_SEGMENT.test(segment) || NUMERIC_SEGMENT.test(segment) || segment.length > 64
        ? ":id"
        : segment,
    );
  return segments.length ? `/${segments.join("/")}` : "/";
}

export function sanitizeAnalyticsProperties(properties: ProductAnalyticsProperties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key, value]) => !SENSITIVE_PROPERTY_PATTERN.test(key) && value !== undefined,
    ),
  ) as Record<string, AnalyticsProperty>;
}

async function initializeProductAnalytics() {
  if (
    typeof window === "undefined" ||
    !isProductAnalyticsConfigured() ||
    getAnalyticsConsent() !== "accepted"
  ) {
    return null;
  }
  if (clientPromise) return clientPromise;

  clientPromise = import("posthog-js")
    .then(({ default: posthog }) => {
      const environment = analyticsEnvironment();
      posthog.init(environment.key, {
        api_host: environment.host,
        defaults: "2026-05-30",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_external_dependency_loading: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
        person_profiles: "identified_only",
        persistence: "localStorage",
        respect_dnt: true,
        property_denylist: ["$current_url", "$referrer", "$referring_domain"],
      });
      return posthog;
    })
    .catch((error: unknown) => {
      clientPromise = null;
      console.warn("[Analytics] integração indisponível", {
        message: error instanceof Error ? error.message : undefined,
      });
      return null;
    });

  return clientPromise;
}

async function disableProductAnalytics() {
  const client = await clientPromise;
  client?.opt_out_capturing();
  client?.reset();
}

export function captureProductEvent(
  event: ProductAnalyticsEvent,
  properties: ProductAnalyticsProperties = {},
) {
  void initializeProductAnalytics().then((client) => {
    client?.capture(event, sanitizeAnalyticsProperties(properties));
  });
}

export async function captureProductEventImmediately(
  event: ProductAnalyticsEvent,
  properties: ProductAnalyticsProperties = {},
) {
  try {
    const client = await initializeProductAnalytics();
    client?.capture(event, sanitizeAnalyticsProperties(properties), { send_instantly: true });
  } catch (error: unknown) {
    console.warn("[Analytics] evento imediato não enviado", {
      message: error instanceof Error ? error.message : undefined,
    });
  }
}

export function identifyProductUser(userId: string, properties: ProductAnalyticsProperties = {}) {
  if (!userId) return;
  void initializeProductAnalytics().then((client) => {
    client?.identify(userId, sanitizeAnalyticsProperties(properties));
  });
}

export function resetProductAnalytics() {
  void initializeProductAnalytics().then((client) => client?.reset());
}
