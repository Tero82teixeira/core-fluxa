import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helper = readFileSync("src/lib/quick-replies.ts", "utf8");
const picker = readFileSync("src/components/communication/quick-reply-picker.tsx", "utf8");
const settings = readFileSync("src/components/communication/quick-replies-settings.tsx", "utf8");
const communication = readFileSync("src/routes/_authenticated/comunicacao.tsx", "utf8");
const quickChat = readFileSync("src/components/layout/staff-quick-chat.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260915120000_communication_quick_replies.sql",
  "utf8",
);
const pgTap = readFileSync("supabase/tests/database/074_communication_quick_replies.sql", "utf8");

test("quick replies remain organization-scoped behind guarded RPCs", () => {
  assert.match(migration, /communication_assert_role\(_organization_id, false\)/);
  assert.match(migration, /communication_assert_role\(_organization_id, true\)/);
  assert.match(migration, /reply\.organization_id = _organization_id/);
  assert.match(migration, /REVOKE ALL ON TABLE[\s\S]*authenticated/);
  assert.match(migration, /SECURITY DEFINER/g);
  assert.match(pgTap, /cannot update a reply from another organization/);
  assert.match(pgTap, /a viewer cannot read/);
});

test("management is limited to communication administrators", () => {
  assert.match(settings, /canManage/);
  assert.match(settings, /useSaveCommunicationQuickReply/);
  assert.match(settings, /Disponível para a equipe/);
  assert.match(pgTap, /operational staff cannot manage/);
});

test("a selected model is inserted for human review and never auto-sent", () => {
  assert.match(helper, /Preserva o texto já digitado/);
  assert.match(helper, /current\.trimEnd\(\)/);
  assert.match(picker, /onSelect\(selected\.content\)/);
  assert.doesNotMatch(picker, /mutateAsync|sendReply|submit/);
  assert.match(communication, /setContent\(current=>applyQuickReply/);
  assert.match(quickChat, /setReply\(\(current\) => applyQuickReply/);
  assert.match(communication, /type!=="nota_interna"&&<QuickReplyPicker/);
});

test("message bodies are excluded from audit metadata", () => {
  assert.match(migration, /jsonb_build_object\('title',[\s\S]*'category',[\s\S]*'is_active'/);
  assert.doesNotMatch(
    migration.match(/jsonb_build_object\([\s\S]*?\)\s*\n\s*\);/)?.[0] ?? "",
    /'content'/,
  );
  assert.match(pgTap, /audit metadata never copies the message body/);
});
