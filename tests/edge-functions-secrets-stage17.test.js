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
      "communication-copilot/index.ts",
      "kiwify-webhook/index.ts",
    ]);
    const configuredFunctions = [
      ...read("supabase/config.toml").matchAll(/^\s*\[functions\.([^\]]+)\]/gm),
    ].map((match) => match[1]);
    assert.deepEqual(configuredFunctions, ["kiwify-webhook", "communication-copilot"]);
  });

  test("frontend chama somente o copiloto autenticado", () => {
    const frontendFiles = trackedFiles.filter(
      (path) => path.startsWith("src/") && [".ts", ".tsx", ".js", ".jsx"].includes(extname(path)),
    );
    const copilotHook = read("src/hooks/use-communication-copilot.ts");
    const otherFrontend = frontendFiles
      .filter((path) => path !== "src/hooks/use-communication-copilot.ts")
      .map(read)
      .join("\n");

    assert.match(copilotHook, /functions\.invoke\("communication-copilot"/);
    assert.doesNotMatch(copilotHook, /OPENAI_API_KEY|SERVICE_ROLE|service_role/);
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
