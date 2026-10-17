import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/workspace";
import { canWriteProperties } from "@/lib/real-estate";
import type { Inquiry } from "@/lib/real-estate-inquiries";
import { catalogUrl } from "@/lib/real-estate-catalog";
import { emptyPreferences, preferencesError } from "@/lib/real-estate-preferences";
import {
  managePreferences,
  usePreferences,
  usePreferenceMatches,
  useSavePreferences,
} from "@/hooks/use-real-estate-preferences";
import { PreferencesForm, PreferenceSelection } from "./preference-selection";
export function InquiryPreferencesDialog({
  request,
  onClose,
}: {
  request: Inquiry;
  onClose: () => void;
}) {
  const { organizationId, role } = useWorkspace();
  const { t } = useTranslation(undefined, { i18n });
  const l = (k: string) => t(`realEstateDemo.preferences.${k}`);
  const query = usePreferences(organizationId, request.id);
  const save = useSavePreferences(organizationId, request.id);
  const [page, setPage] = useState(1),
    [only, setOnly] = useState(true);
  const matches = usePreferenceMatches(
    organizationId,
    request.id,
    query.data?.version || 0,
    only,
    page,
  );
  const [selected, setSelected] = useState<string[]>([]),
    [link, setLink] = useState("");
  const [generating, setGenerating] = useState(false);
  const busy = save.isPending || generating;
  const error = (e: unknown) => toast.error(l(preferencesError(e)));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl"
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {l("title")} · {request.name}
          </DialogTitle>
          <DialogDescription>{l("intro")}</DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p>{l("loading")}</p>
        ) : query.isError || !query.data ? (
          <div role="alert">
            <p>{l("error")}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              {l("retry")}
            </Button>
          </div>
        ) : (
          <>
            <PreferencesForm
              key={query.data.version}
              initial={query.data.preferences || emptyPreferences(request.purpose)}
              writable={canWriteProperties(role)}
              busy={busy}
              onSave={async (preferences) => {
                try {
                  await save.mutateAsync({ preferences, version: query.data.version });
                  setSelected([]);
                  setLink("");
                  setPage(1);
                  toast.success(l("saved"));
                } catch (e) {
                  error(e);
                }
              }}
            />
            {query.data.preferences &&
              (matches.isPending ? (
                <p>{l("loading")}</p>
              ) : matches.isError ? (
                <div role="alert">
                  <p>{l("error")}</p>
                  <Button variant="outline" onClick={() => void matches.refetch()}>
                    {l("retry")}
                  </Button>
                </div>
              ) : (
                <PreferenceSelection
                  items={matches.data?.items || []}
                  total={matches.data?.total || 0}
                  page={page}
                  onPage={setPage}
                  only={only}
                  onOnly={(value) => {
                    setOnly(value);
                    setPage(1);
                  }}
                  selected={selected}
                  onSelect={(ids) => {
                    setSelected(ids);
                    setLink("");
                  }}
                  link={link}
                  busy={busy}
                  purpose={query.data.preferences.purpose}
                  phone={request.phone}
                  onGenerate={async () => {
                    if (!organizationId) return;
                    setGenerating(true);
                    setLink("");
                    try {
                      const result = await managePreferences(
                        organizationId,
                        request.id,
                        "selection",
                        { ids: selected },
                      );
                      if (!result.token || !result.ids?.length) throw new Error("SELECTION");
                      setLink(catalogUrl(window.location.origin, result.token, result.ids));
                    } catch (e) {
                      error(e);
                      void matches.refetch();
                    } finally {
                      setGenerating(false);
                    }
                  }}
                />
              ))}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
