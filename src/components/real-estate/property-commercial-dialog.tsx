import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { commercialDefaults, type CommercialFilters } from "@/lib/real-estate-commercial";
import { useCommercialSummary } from "@/hooks/use-real-estate-commercial";
import { CommercialFilterForm, CommercialPanel } from "./commercial-panel";
export function PropertyCommercialDialog({
  onClose,
  onQueue,
}: {
  onClose: () => void;
  onQueue: (f: CommercialFilters) => void;
}) {
  const { organizationId } = useWorkspace();
  const { t } = useTranslation(undefined, { i18n });
  const l = (k: string) => t(`realEstateDemo.commercial.${k}`);
  const [filters, setFilters] = useState(commercialDefaults);
  const query = useCommercialSummary(organizationId, filters);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{l("title")}</DialogTitle>
          <DialogDescription>{l("intro")}</DialogDescription>
        </DialogHeader>
        <CommercialFilterForm
          initial={filters}
          responsibles={query.data?.responsibles || []}
          busy={query.isFetching}
          onApply={setFilters}
        />
        {query.isPending ? (
          <p>{l("loading")}</p>
        ) : query.isError ? (
          <div role="alert">
            <p>{l("error")}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              {l("retry")}
            </Button>
          </div>
        ) : (
          query.data && <CommercialPanel data={query.data} filters={filters} onQueue={onQueue} />
        )}
      </DialogContent>
    </Dialog>
  );
}
