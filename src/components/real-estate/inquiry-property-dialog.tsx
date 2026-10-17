import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { useProperties } from "@/hooks/use-real-estate";
import { useManualAttendance } from "@/hooks/use-real-estate-manual-attendance";
import { inquiryError, type Inquiry } from "@/lib/real-estate-inquiries";
import { manualAttendanceError } from "@/lib/real-estate-manual-attendance";
export function InquiryPropertyDialog({
  request,
  onClose,
}: {
  request: Inquiry;
  onClose: () => void;
}) {
  const { organizationId } = useWorkspace();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useProperties(
    organizationId,
    { search, page, purpose: request.purpose, status: "", type: "", city: "" },
    true,
  );
  const attach = useManualAttendance(organizationId);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !attach.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vincular imóvel · {request.name}</DialogTitle>
          <DialogDescription>
            Escolha um imóvel da finalidade deste atendimento. Depois você poderá vincular um
            cliente cadastrado e agendar a visita.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Buscar imóvel"
          placeholder="Código, título, bairro ou cidade"
          maxLength={120}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {query.isPending ? (
          <p>Carregando…</p>
        ) : query.isError ? (
          <p role="alert">Não foi possível buscar imóveis.</p>
        ) : (
          <>
            <div className="space-y-2">
              {query.data?.items.map((p) => (
                <div key={p.id} className="space-y-2 rounded-lg border p-3">
                  <p>
                    {p.code} · {p.title} · {p.status}
                  </p>
                  <Button
                    variant="outline"
                    disabled={attach.isPending || !["disponivel", "reservado"].includes(p.status)}
                    onClick={async () => {
                      try {
                        await attach.mutateAsync({
                          action: "attach",
                          id: request.id,
                          values: { version: request.version, property_id: p.id },
                        });
                        onClose();
                      } catch (e) {
                        toast.error(manualAttendanceError(e) || inquiryError(e));
                      }
                    }}
                  >
                    Vincular este imóvel
                  </Button>
                </div>
              ))}
            </div>
            {!query.data?.items.length && <p>Nenhum imóvel encontrado.</p>}
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1 || attach.isPending}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={page * 20 >= (query.data?.total || 0) || attach.isPending}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
