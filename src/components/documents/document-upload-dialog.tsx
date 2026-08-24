import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

import { useClients, useProcesses } from "@/hooks/use-operations";
import { useDocumentTypes, useUploadDocument } from "@/hooks/use-documents";
import { useWorkspace } from "@/lib/workspace";
import { describeError } from "@/lib/errors";
import {
  ACCEPT_ATTRIBUTE,
  formatFileSize,
  suggestExpiration,
  validateFile,
} from "@/lib/documents";

const NONE = "none";

export type UploadScope = {
  clientId?: string | null;
  processId?: string | null;
  checklistItemId?: string | null;
  suggestedTitle?: string;
  lockScope?: boolean;
};

export function DocumentUploadDialog({
  open,
  onOpenChange,
  scope,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope?: UploadScope;
  onUploaded?: () => void;
}) {
  const { organizationId } = useWorkspace();
  const clients = useClients(organizationId);
  const processes = useProcesses(organizationId);
  const types = useDocumentTypes(organizationId);
  const upload = useUploadDocument(organizationId);
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [typeId, setTypeId] = useState<string>(NONE);
  const [clientId, setClientId] = useState<string>(scope?.clientId ?? NONE);
  const [processId, setProcessId] = useState<string>(scope?.processId ?? NONE);
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuer, setIssuer] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [notes, setNotes] = useState("");
  const [dragging, setDragging] = useState(false);

  const selectedType = useMemo(
    () => (types.data ?? []).find((item) => item.id === typeId) ?? null,
    [types.data, typeId],
  );

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setFileError(null);
    setTitle(scope?.suggestedTitle ?? "");
    setTypeId(NONE);
    setClientId(scope?.clientId ?? NONE);
    setProcessId(scope?.processId ?? NONE);
    setDocumentNumber("");
    setIssuer("");
    setIssueDate("");
    setExpirationDate("");
    setNotes("");
  }, [open, scope?.clientId, scope?.processId, scope?.suggestedTitle]);

  useEffect(() => {
    if (!selectedType?.default_validity_days || !issueDate || expirationDate) return;
    setExpirationDate(suggestExpiration(issueDate, selectedType.default_validity_days));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType?.id, issueDate]);

  const availableProcesses = useMemo(() => {
    const rows = processes.data ?? [];
    if (clientId === NONE) return rows;
    return rows.filter((row) => row.client_id === clientId);
  }, [processes.data, clientId]);

  const pickFile = (picked: File | null) => {
    if (!picked) return;
    const invalid = validateFile(picked);
    setFileError(invalid);
    setFile(invalid ? null : picked);
    if (!invalid && !title.trim()) setTitle(picked.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (upload.isPending) return;
    if (!file) {
      setFileError("Selecione um arquivo para enviar.");
      return;
    }
    if (!title.trim()) {
      toast.error("Informe o título do documento.");
      return;
    }
    if (selectedType?.requires_expiration_date && !expirationDate) {
      toast.error("Este tipo de documento exige data de validade.");
      return;
    }

    try {
      await upload.mutateAsync({
        file,
        title: title.trim(),
        document_type_id: typeId === NONE ? null : typeId,
        client_id: clientId === NONE ? null : clientId,
        process_id: processId === NONE ? null : processId,
        checklist_item_id: scope?.checklistItemId ?? null,
        document_number: documentNumber.trim() || null,
        issuer: issuer.trim() || null,
        issue_date: issueDate || null,
        expiration_date: expirationDate || null,
        notes: notes.trim() || null,
      });
      toast.success("Documento enviado.");
      onOpenChange(false);
      onUploaded?.();
    } catch (error) {
      toast.error(describeError(error, "documento"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enviar documento</DialogTitle>
          <DialogDescription>
            PDF, JPG, PNG, DOCX ou XLSX de até 20 MB. O arquivo fica em área privada da empresa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5" noValidate>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              pickFile(event.dataTransfer.files?.[0] ?? null);
            }}
            className={`rounded-xl border border-dashed p-5 text-center transition-colors ${
              dragging ? "border-brand bg-brand/5" : "border-border"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept={ACCEPT_ATTRIBUTE}
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex items-center justify-between gap-3 text-left">
                <div className="flex min-w-0 items-center gap-3">
                  <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)} aria-label="Remover arquivo">
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <FileUp className="mx-auto size-6 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">Arraste o arquivo aqui ou selecione no computador.</p>
                <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                  Selecionar arquivo
                </Button>
              </div>
            )}
          </div>
          {fileError && <p className="text-xs text-destructive">{fileError}</p>}

          {upload.isPending && <Progress value={70} className="h-1.5" aria-label="Enviando arquivo" />}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doc-title">Título</Label>
              <Input id="doc-title" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-type">Tipo de documento</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger id="doc-type" className="h-10">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não classificado</SelectItem>
                  {(types.data ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-internal-code">Código interno</Label>
              <Input
                id="doc-internal-code"
                value="Gerado automaticamente"
                readOnly
                className="bg-muted text-muted-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-number">Número oficial / identificação (opcional)</Label>
              <Input
                id="doc-number"
                maxLength={80}
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-client">Cliente</Label>
              <Select
                value={clientId}
                onValueChange={(value) => {
                  setClientId(value);
                  setProcessId(NONE);
                }}
                disabled={scope?.lockScope}
              >
                <SelectTrigger id="doc-client" className="h-10">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem vínculo</SelectItem>
                  {(clients.data ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-process">Processo</Label>
              <Select value={processId} onValueChange={setProcessId} disabled={scope?.lockScope}>
                <SelectTrigger id="doc-process" className="h-10">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem vínculo</SelectItem>
                  {availableProcesses.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.code} — {item.title ?? item.clients?.name ?? "Processo"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-issuer">Órgão emissor</Label>
              <Input id="doc-issuer" maxLength={120} value={issuer} onChange={(e) => setIssuer(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-issue">Data de emissão</Label>
              <Input id="doc-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-exp">
                Validade {selectedType?.requires_expiration_date ? "(obrigatória)" : "(opcional)"}
              </Label>
              <Input
                id="doc-exp"
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doc-notes">Observações</Label>
              <Textarea id="doc-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={upload.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={upload.isPending} aria-busy={upload.isPending}>
              {upload.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {upload.isPending ? "Enviando…" : "Enviar documento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
