import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { inquiryValues, inquiryError, type InquiryForm } from "@/lib/real-estate-inquiries";
import type { CatalogListing } from "@/lib/real-estate-catalog";
export function PublicInquiryForm({
  token,
  listing,
  kind,
  onClose,
}: {
  token: string;
  listing: CatalogListing;
  kind: "informacao" | "visita";
  onClose: () => void;
}) {
  const [form, setForm] = useState<InquiryForm>({
    name: "",
    phone: "",
    purpose: listing.purpose === "locacao" ? "locacao" : "venda",
    kind,
    preferred_day: "",
    preferred_period: "",
    message: "",
    consent: false,
    website: "",
  });
  const [id] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {kind === "visita" ? "Solicitar uma visita" : "Pedir informações"}
          </DialogTitle>
          <DialogDescription>
            {listing.title} · {listing.code}. A equipe retornará pelo telefone informado. A
            preferência de horário depende de confirmação.
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-4">
            <p role="status">
              Solicitação recebida. Aguarde o contato da imobiliária para confirmar os próximos
              passos.
            </p>
            <Button onClick={onClose}>Concluir</Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setError("");
              setBusy(true);
              try {
                const values = inquiryValues(form);
                const { error } = await supabase.rpc("real_estate_submit_inquiry", {
                  _token: token,
                  _listing_id: listing.id,
                  _request_id: id,
                  _values: values,
                });
                if (error) throw error;
                setDone(true);
              } catch (e) {
                setError(
                  inquiryError(e) ||
                    "Não foi possível enviar. Tente novamente ou use o WhatsApp da imobiliária.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Label className="block space-y-2">
              Nome
              <Input
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Label>
            <Label className="block space-y-2">
              Telefone/WhatsApp com DDD
              <Input
                required
                type="tel"
                maxLength={25}
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Label>
            <Label className="block space-y-2">
              Interesse
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              >
                {listing.purpose !== "locacao" && <option value="venda">Compra</option>}
                {listing.purpose !== "venda" && <option value="locacao">Locação</option>}
              </select>
            </Label>
            {kind === "visita" && (
              <div className="grid grid-cols-2 gap-3">
                <Label className="space-y-2">
                  Dia preferido (opcional)
                  <Input
                    type="date"
                    value={form.preferred_day}
                    onChange={(e) => setForm({ ...form, preferred_day: e.target.value })}
                  />
                </Label>
                <Label className="space-y-2">
                  Período
                  <select
                    className="h-10 w-full rounded-md border bg-background px-2"
                    value={form.preferred_period}
                    onChange={(e) => setForm({ ...form, preferred_period: e.target.value })}
                  >
                    <option value="">Sem preferência</option>
                    <option value="manha">Manhã</option>
                    <option value="tarde">Tarde</option>
                    <option value="noite">Noite</option>
                  </select>
                </Label>
              </div>
            )}
            <Label className="block space-y-2">
              Mensagem (opcional)
              <textarea
                maxLength={500}
                rows={3}
                className="w-full rounded-md border bg-background p-3"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </Label>
            <div className="hidden" aria-hidden>
              <label>
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                />
              </label>
            </div>
            <Label className="flex items-start gap-2">
              <input
                required
                type="checkbox"
                checked={form.consent}
                onChange={(e) => setForm({ ...form, consent: e.target.checked })}
              />
              Autorizo a imobiliária a usar meu nome, telefone e mensagem para atender este pedido.
            </Label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={busy}>{busy ? "Enviando…" : "Enviar solicitação"}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
