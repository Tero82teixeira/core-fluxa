import { useState } from "react";
import { FolderOpen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { DocumentCard } from "@/components/documents/document-list";
import { DocumentUploadDialog } from "@/components/documents/document-upload-dialog";

import { useDocumentsFor } from "@/hooks/use-documents";
import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";

/** Painel de documentos usado na ficha do cliente e na tela do processo. */
export function DocumentScopePanel({
  clientId,
  processId,
  emptyDescription,
}: {
  clientId?: string | null;
  processId?: string | null;
  emptyDescription?: string;
}) {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const documents = useDocumentsFor(organizationId, { clientId, processId });
  const [uploadOpen, setUploadOpen] = useState(false);
  const rows = documents.data ?? [];

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Documentos ({rows.length})</h2>
          {permissions.canUploadDocuments && (
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Plus className="size-4" aria-hidden /> Enviar documento
            </Button>
          )}
        </div>

        {documents.isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((key) => (
              <Skeleton key={key} className="h-20 w-full" />
            ))}
          </div>
        ) : documents.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar os documentos.</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="Nenhum documento anexado"
            description={emptyDescription ?? "Envie arquivos para manter o histórico documental completo."}
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((document) => (
              <DocumentCard key={document.id} document={document} showLinks={!processId} />
            ))}
          </ul>
        )}
      </CardContent>

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        scope={{ clientId: clientId ?? null, processId: processId ?? null, lockScope: true }}
      />
    </Card>
  );
}
