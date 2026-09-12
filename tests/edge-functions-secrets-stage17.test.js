import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname } from "node:path";
import { describe, test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const trackedFiles = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter((path) => path && existsSync(new URL(`../${path}`, import.meta.url)));

describe("ETAPA 17 — Edge Functions e higiene de secrets", () => {
  test("somente as Edge Functions aprovadas estão implementadas e configuradas", () => {
    const functionsUrl = new URL("../supabase/functions", import.meta.url);
    const functionEntries = existsSync(functionsUrl)
      ? readdirSync(functionsUrl, { recursive: true }).filter((entry) => {
          const url = new URL(String(entry), `${functionsUrl.href}/`);
          return statSync(url).isFile() && String(entry).endsWith("index.ts");
        })
      : [];

    assert.deepEqual(functionEntries, [
      "asaas-billing-automation/index.ts",
      "asaas-connector/index.ts",
      "asaas-webhook/index.ts",
      "communication-channel-send/index.ts",
      "communication-channel-webhook/index.ts",
      "communication-copilot/index.ts",
      "communication-push/index.ts",
      "kiwify-webhook/index.ts",
    ]);
    const configuredFunctions = [
      ...read("supabase/config.toml").matchAll(/^\s*\[functions\.([^\]]+)\]/gm),
    ].map((match) => match[1]);
    assert.deepEqual(configuredFunctions, [
      "kiwify-webhook",
      "asaas-connector",
      "asaas-webhook",
      "asaas-billing-automation",
      "communication-copilot",
      "communication-push",
      "communication-channel-send",
      "communication-channel-webhook",
    ]);
  });

  test("frontend chama somente as Edge Functions autenticadas aprovadas", () => {
    const frontendFiles = trackedFiles.filter(
      (path) => path.startsWith("src/") && [".ts", ".tsx", ".js", ".jsx"].includes(extname(path)),
    );
    const copilotHook = read("src/hooks/use-communication-copilot.ts");
    const pushHook = read("src/hooks/use-push-notifications.ts");
    const portalCommunicationHook = read("src/hooks/use-client-portal-communication.ts");
    const portalExperienceHook = read("src/hooks/use-client-portal-experience.ts");
    const communicationHook = read("src/hooks/use-communication.ts");
    const channelHook = read("src/hooks/use-communication-channels.ts");
    const asaasHook = read("src/hooks/use-asaas.ts");
    const otherFrontend = frontendFiles
      .filter(
        (path) =>
          ![
            "src/hooks/use-communication-copilot.ts",
            "src/hooks/use-push-notifications.ts",
            "src/hooks/use-client-portal-communication.ts",
            "src/hooks/use-client-portal-experience.ts",
            "src/hooks/use-communication.ts",
            "src/hooks/use-communication-channels.ts",
            "src/hooks/use-asaas.ts",
          ].includes(path),
      )
      .map(read)
      .join("\n");

    assert.match(copilotHook, /functions\.invoke\("communication-copilot"/);
    assert.match(pushHook, /functions\.invoke\("communication-push"/);
    assert.match(portalCommunicationHook, /functions\.invoke\("communication-push"/);
    assert.match(portalExperienceHook, /functions\.invoke\("communication-push"/);
    assert.match(communicationHook, /functions\.invoke\("communication-push"/);
    assert.match(channelHook, /functions\.invoke\("communication-channel-send"/);
    assert.match(asaasHook, /functions\.invoke\("asaas-connector"/);
    assert.doesNotMatch(copilotHook, /OPENAI_API_KEY|SERVICE_ROLE|service_role/);
    assert.doesNotMatch(
      pushHook + portalCommunicationHook + portalExperienceHook + communicationHook,
      /VAPID_PRIVATE_KEY|SERVICE_ROLE|service_role/,
    );
    assert.doesNotMatch(channelHook, /META_WHATSAPP|RESEND_API_KEY|SERVICE_ROLE|service_role/);
    assert.doesNotMatch(asaasHook, /ASAAS_CREDENTIALS_ENCRYPTION_KEY|SERVICE_ROLE|service_role/);
    assert.doesNotMatch(otherFrontend, /functions\s*\.\s*invoke\s*\(/);
    assert.doesNotMatch(otherFrontend, /supabase\s*\.\s*functions\b/);
    assert.doesNotMatch(otherFrontend, /\/functions\/v1\//);
  });

  test("arquivos versionáveis não contêm secrets privados literais plausíveis", () => {
    const textFiles = trackedFiles.filter(
      (path) =>
        !path.startsWith("tests/") &&
        !path.startsWith("public/") &&
        ![".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2"].includes(extname(path)),
    );
    const secretPatterns = [
      new RegExp(`sb_${"secret"}_[A-Za-z0-9_-]{20,}`),
      /(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|RESEND_API_KEY)\s*=\s*["'][A-Za-z0-9_+\/.=-]{20,}["']/,
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
      /\bsk_[A-Za-z0-9_-]{20,}\b/,
    ];

    for (const path of textFiles) {
      const contents = read(path);
      if (/(?:^|\/)\.env(?:\.|$)/.test(path)) {
        assert.doesNotMatch(
          contents,
          /^(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|RESEND_API_KEY)=[A-Za-z0-9_+\/.=-]{20,}$/m,
          `${path} contém um secret privado plausível`,
        );
      }
      for (const pattern of secretPatterns) {
        assert.doesNotMatch(contents, pattern, `${path} contém um secret privado plausível`);
      }
    }
  });

  test("arquivos locais e de produção estão ignorados", () => {
    const ignored = execFileSync(
      "git",
      ["check-ignore", "--no-index", ".env.local", ".env.stage.local", ".env.production"],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n");

    assert.deepEqual(ignored, [".env.local", ".env.stage.local", ".env.production"]);
  });
});
