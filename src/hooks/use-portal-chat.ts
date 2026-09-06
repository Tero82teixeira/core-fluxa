import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { validateFile } from "@/lib/documents";

const ATTACHMENT_BUCKET = "communication-attachments";

export type PortalChatAttachment = {
  attachment_id: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size: number | null;
};

export function useUploadPortalChatAttachment(identityScope: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      threadId,
      file,
      content,
    }: {
      threadId: string;
      file: File;
      content?: string;
    }) => {
      const validationError = validateFile(file);
      if (validationError) throw new Error(validationError);
      const { data: prepared, error: prepareError } = await supabase.rpc(
        "prepare_communication_attachment_upload",
        {
          _thread_id: threadId,
          _original_file_name: file.name,
          _mime_type: file.type,
          _file_size: file.size,
        },
      );
      if (prepareError) throw prepareError;
      const intent = prepared?.[0];
      if (!intent) throw new Error("Não foi possível preparar o anexo.");

      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(intent.file_path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { error: finalizeError } = await supabase.rpc(
        "finalize_communication_attachment_upload",
        { _attachment_id: intent.attachment_id, _content: content?.trim() || undefined },
      );
      if (finalizeError) {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([intent.file_path]);
        throw finalizeError;
      }
      return threadId;
    },
    onSuccess: (threadId) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-portal-communication-threads"] }),
        queryClient.invalidateQueries({ queryKey: ["client-portal-communication-entries"] }),
        queryClient.invalidateQueries({ queryKey: ["staff-client-portal-inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["staff-client-portal-entries"] }),
        queryClient.invalidateQueries({ queryKey: ["staff-client-portal-service-center"] }),
        queryClient.invalidateQueries({ queryKey: ["communication-entries", threadId] }),
      ]),
  });
}

export async function openPortalChatAttachment(filePath: string, fileName: string) {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(filePath, 60, { download: fileName });
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export function usePortalChatRealtime({
  topic,
  enabled,
}: {
  topic: string | null;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled || !topic) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event: "message" }, () => {
          void queryClient.invalidateQueries({ queryKey: ["client-portal-communication-threads"] });
          void queryClient.invalidateQueries({ queryKey: ["client-portal-communication-entries"] });
          void queryClient.invalidateQueries({ queryKey: ["client-portal-notifications"] });
          void queryClient.invalidateQueries({ queryKey: ["staff-client-portal-inbox"] });
          void queryClient.invalidateQueries({ queryKey: ["staff-client-portal-entries"] });
          void queryClient.invalidateQueries({ queryKey: ["staff-client-portal-service-center"] });
        })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient, topic]);
}
