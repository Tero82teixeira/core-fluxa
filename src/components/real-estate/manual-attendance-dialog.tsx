import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/workspace";
import { usePropertyOptions } from "@/hooks/use-real-estate";
import { useManualAttendance } from "@/hooks/use-real-estate-manual-attendance";
import { inquiryError } from "@/lib/real-estate-inquiries";
import { manualAttendanceError } from "@/lib/real-estate-manual-attendance";
import { ManualAttendanceForm } from "./manual-attendance-form";
export function ManualAttendanceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const { organizationId, user } = useWorkspace();
  const [id] = useState(() => crypto.randomUUID());
  const options = usePropertyOptions(organizationId, true);
  const create = useManualAttendance(organizationId);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !create.isPending) onClose();
      }}
    >
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl"
        onInteractOutside={(e) => {
          if (create.isPending) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (create.isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Novo atendimento manual</DialogTitle>
          <DialogDescription>
            Registre um contato recebido por WhatsApp, telefone ou presencialmente. O imóvel pode
            ser definido depois. Use dados de contato fornecidos para esse atendimento.
          </DialogDescription>
        </DialogHeader>
        {options.isPending ? (
          <p>Carregando equipe…</p>
        ) : options.isError ? (
          <p role="alert">Não foi possível carregar a equipe. Feche e tente novamente.</p>
        ) : (
          <ManualAttendanceForm
            responsibles={options.data?.responsibles || []}
            initialResponsible={
              options.data?.responsibles.some((r) => r.id === user?.id) ? user!.id : ""
            }
            busy={create.isPending}
            onCreate={async (values) => {
              try {
                const result = await create.mutateAsync({ action: "create", id, values });
                toast[result.duplicate ? "info" : "success"](
                  result.duplicate
                    ? "Já existe atendimento ativo para este contato e finalidade, sem imóvel definido. Abra o registro existente."
                    : "Atendimento criado com as preferências salvas.",
                );
                onCreated(result.name);
              } catch (e) {
                toast.error(manualAttendanceError(e) || inquiryError(e));
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
