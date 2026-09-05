import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260906210000_portal_chat_realtime_attachments_reads.sql",
  "utf8",
);
const portal = readFileSync("src/routes/meu-portal.tsx", "utf8");
const staff = readFileSync("src/components/layout/staff-quick-chat.tsx", "utf8");
const chatHook = readFileSync("src/hooks/use-portal-chat.ts", "utf8");
const clientHook = readFileSync("src/hooks/use-client-portal-communication.ts", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

describe("chat completo e seguro do Meu Portal", () => {
  test("anexos usam bucket privado, intenção temporária e caminho exato", () => {
    assert.match(migration, /'communication-attachments'.*false, 20971520/s);
    assert.match(migration, /attachment\.uploader_id = auth\.uid\(\)/);
    assert.match(migration, /attachment\.expires_at > now\(\)/);
    assert.match(migration, /public\.can_upload_communication_attachment\(name\)/);
    assert.match(migration, /public\.can_access_communication_attachment\(name\)/);
    assert.match(migration, /ATTACHMENT_OBJECT_MISMATCH/);
  });

  test("acesso a arquivo exige papel interno ou vínculo ativo do cliente", () => {
    assert.match(migration, /public\.has_org_role[\s\S]+superadmin[\s\S]+operacional/);
    assert.match(migration, /client_portal_access[\s\S]+access\.user_id = auth\.uid\(\)/);
    assert.match(migration, /share\.is_shared/);
    assert.doesNotMatch(chatHook, /service_role/);
  });

  test("confirmações de leitura são isoladas e projetadas por RPC", () => {
    assert.match(migration, /CREATE TABLE public\.communication_thread_reads/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.communication_thread_reads/);
    assert.match(migration, /mark_client_portal_communication_read/);
    assert.match(migration, /mark_staff_portal_communication_read/);
    assert.match(clientHook, /read_at: string \| null/);
    assert.match(portal, /entry\.read_at \? "Lida" : "Enviada"/);
    assert.match(staff, /entry\.read_at \? "Lida" : "Enviada"/);
  });

  test("tempo real envia somente o identificador e mantém RPCs como fonte", () => {
    assert.match(migration, /realtime\.send\(/);
    assert.match(migration, /jsonb_build_object\('thread_id', NEW\.thread_id\)/);
    assert.doesNotMatch(migration, /jsonb_build_object\('content'/);
    assert.match(migration, /portal_chat_broadcast_select/);
    assert.match(chatHook, /config: \{ private: true \}/);
    assert.match(chatHook, /invalidateQueries/);
  });

  test("cliente e equipe podem anexar e abrir arquivos autorizados", () => {
    for (const source of [portal, staff]) {
      assert.match(source, /accept="\.pdf,\.jpg,\.jpeg,\.png,\.doc,\.docx,\.xls,\.xlsx"/);
      assert.match(source, /openPortalChatAttachment/);
      assert.match(source, /useUploadPortalChatAttachment/);
    }
    assert.match(chatHook, /prepare_communication_attachment_upload/);
    assert.match(chatHook, /finalize_communication_attachment_upload/);
  });

  test("tipos do banco incluem anexos, leitura e projeções novas", () => {
    assert.match(types, /communication_attachments: \{/);
    assert.match(types, /communication_thread_reads: \{/);
    assert.match(types, /staff_client_portal_communication_entries: \{/);
    assert.match(types, /prepare_communication_attachment_upload: \{/);
  });
});
