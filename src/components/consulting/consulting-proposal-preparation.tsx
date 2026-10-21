import "@/i18n";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ConsultingProposalDraft } from "./consulting-proposal-draft";
import {
  proposalFromConsultingDiagnostic,
  type ConsultingProposalDraft as Draft,
} from "@/lib/consulting-proposal";
export function ConsultingProposalPreparation({
  expectedResult,
  clientName,
  today,
  disabled,
  onSave,
  viewProposals,
}: {
  expectedResult: string;
  clientName: string;
  today: string;
  disabled?: boolean;
  onSave: (draft: Draft) => Promise<void>;
  viewProposals: ReactNode;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft | null>(null),
    [saved, setSaved] = useState(false);
  if (saved)
    return (
      <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <p role="status" className="text-sm">
          {t("consultingProposal.saved")}
        </p>
        {viewProposals}
      </div>
    );
  return (
    <div className="space-y-3">
      {draft ? (
        <>
          <ConsultingProposalDraft
            initial={draft}
            clientName={clientName}
            today={today}
            onCancel={() => setDraft(null)}
            onSave={async (values) => {
              await onSave(values);
              setSaved(true);
              setDraft(null);
            }}
          />
          {viewProposals}
        </>
      ) : (
        <>
          <Button
            className="min-h-11"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              setDraft(
                proposalFromConsultingDiagnostic(
                  expectedResult,
                  t("consultingProposal.defaultTitle"),
                ),
              )
            }
          >
            {t("consultingProposal.prepare")}
          </Button>
          <p className="text-sm text-muted-foreground">{t("consultingProposal.prepareHint")}</p>
        </>
      )}
    </div>
  );
}
