import { useRef, useState } from "react";
import {
  Check,
  Archive,
  Download,
  Eye,
  FileText,
  History,
  Loader2,
  MoreHorizontal,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/shared/status-badge";

import {
  createDocumentUrl,
  useArchiveDocument,
  useDocumentVersions,
  useReviewDocument,
  useUploadDocumentVersion,
  type DocumentRow,
} from "@/hooks/use-documents";
import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { describeError } from "@/lib/errors";
import { ACCEPT_ATTRIBUTE, DOCUMENT_STATUS, daysUntilLabel, formatFileSize } from "@/lib/documents";
import { formatDate, formatDateTime } from "@/lib/format";

function ExpirationHint({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground">Sem validade</span>;
  const info = daysUntilLabel(date);
  return (
    <span className={info.critical ? "font-medium text-destructive" : info.warning ? "font-medium text-warning" : ""}>
      {formatDate(date)} · {info.label}
    </span>
  );
}

export function DocumentCard({
  document,
  showLinks = true,
}: {
  document: DocumentRow;
  showLinks?: boolean;
}) {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const review = useReviewDocument(organizationId);
  const archive = useArchiveDocument(organizationId);
  const newVersion = useUploadDocumentVersion(organizationId);
  const fileRef = useRef<HTMLInputElement>(null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const status = DOCUMENT_STATUS[document.status];

  const openFile = async (download?: boolean) => {
    setBusy(true);
    try {
      const url = await createDocumentUrl(document.file_path, download ? document.original_file_name : undefined);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(describeError(error, "documento"));
    } finally {
      setBusy(false);
    }
  };

  const sendVersion = async (file: File | null) => {
    if (!file) return;
    try {
      await newVersion.mutateAsync({ document, file });
      toast.success("Nova versão registrada.");
    } catch (error) {
      toast.error(describeError(error, "upload"));
    }
  };

  const setStatus = async (next: "aprovado" | "rejeitado" | "em_analise", motive?: string) => {
    try {
      await review.mutateAsync({ document, status: next, reason: motive });
      toast.success(
        next === "aprovado" ? "Documento aprovado." : next === "rejeitado" ? "Documento rejeitado." : "Documento em análise.",
      );
      setRejectOpen(false);
      setReason("");
    } catch (error) {
      toast.error(describeError(error, "documento"));
    }
  };

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/60">
          <FileText className="size-4 text-muted-foreground" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{document.title}</p>
            <StatusBadge label={status.label} tone={status.tone} />
            {document.current_version > 1 && (
              <span className="text-xs text-muted-foreground">v{document.current_version}</span>
            )}
          </div>
          <p className="text-xs font-medium">
            {document.internal_code}
            {document.document_number && (
              <span className="font-normal text-muted-foreground">
                {` · Número oficial: ${document.document_number}`}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {document.document_types?.name ?? "Sem tipo"} · {document.original_file_name} ·{" "}
            {formatFileSize(document.file_size)}
          </p>
          <p className="text-xs text-muted-foreground">
            Validade: <ExpirationHint date={document.expiration_date} />
          </p>
          {showLinks && (document.clients || document.processes) && (
            <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {document.clients && (
                <Link to="/clientes/$clientId" params={{ clientId: document.clients.id }} className="hover:underline">
                  {document.clients.name}
                </Link>
              )}
              {document.processes && (
                <Link
                  to="/processos/$processId"
                  params={{ processId: document.processes.id }}
                  className="hover:underline"
                >
                  {document.processes.code}
                </Link>
              )}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Enviado por {document.uploaded_by_name ?? "—"} em {formatDateTime(document.created_at)}
          </p>
          {document.status === "rejeitado" && document.rejection_reason && (
            <p className="text-xs text-destructive">Motivo: {document.rejection_reason}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-start">
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          accept={ACCEPT_ATTRIBUTE}
          onChange={(event) => {
            void sendVersion(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" onClick={() => void openFile(false)} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          Abrir
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Ações do documento ${document.title}`}>
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => void openFile(true)}>
              <Download className="size-4" aria-hidden /> Baixar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
              <History className="size-4" aria-hidden /> Ver versões
            </DropdownMenuItem>
            {permissions.canUploadDocuments && (
              <DropdownMenuItem onSelect={() => fileRef.current?.click()} disabled={newVersion.isPending}>
                <Upload className="size-4" aria-hidden /> Enviar nova versão
              </DropdownMenuItem>
            )}
            {permissions.canReviewDocuments && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void setStatus("aprovado")} disabled={review.isPending}>
                  <Check className="size-4" aria-hidden /> Aprovar
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setRejectOpen(true)} disabled={review.isPending}>
                  <X className="size-4" aria-hidden /> Rejeitar
                </DropdownMenuItem>
              </>
            )}
            {permissions.canArchiveDocuments && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    try {
                      await archive.mutateAsync({
                        id: document.id,
                        archived: !document.archived_at,
                        title: document.title,
                      });
                      toast.success(document.archived_at ? "Documento restaurado." : "Documento arquivado.");
                    } catch (error) {
                      toast.error(describeError(error, "documento"));
                    }
                  }}
                >
                  <Archive className="size-4" aria-hidden />
                  {document.archived_at ? "Restaurar" : "Arquivar"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar documento</DialogTitle>
            <DialogDescription>Informe o motivo — ele fica registrado no histórico do processo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`reason-${document.id}`}>Motivo da rejeição</Label>
            <Textarea
              id={`reason-${document.id}`}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || review.isPending}
              onClick={() => void setStatus("rejeitado", reason.trim())}
            >
              Rejeitar documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VersionsDialog documentId={document.id} open={historyOpen} onOpenChange={setHistoryOpen} enabled={historyOpen} />
    </li>
  );
}

function VersionsDialog({
  documentId,
  open,
  onOpenChange,
  enabled,
}: {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabled: boolean;
}) {
  const versions = useDocumentVersions(enabled ? documentId : null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico de versões</DialogTitle>
          <DialogDescription>Todas as substituições ficam registradas e podem ser abertas.</DialogDescription>
        </DialogHeader>
        {versions.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (versions.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma versão registrada.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(versions.data ?? []).map((version) => (
              <li key={version.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    v{version.version_number} · {version.original_file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(version.created_at)} · {version.uploaded_by_name ?? "—"} ·{" "}
                    {formatFileSize(version.file_size)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const url = await createDocumentUrl(version.file_path);
                      window.open(url, "_blank", "noopener,noreferrer");
                    } catch (error) {
                      toast.error(describeError(error, "documento"));
                    }
                  }}
                >
                  Abrir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  return (
    <ul className="space-y-3">
      {documents.map((document) => (
        <DocumentCard key={document.id} document={document} />
      ))}
    </ul>
  );
}
