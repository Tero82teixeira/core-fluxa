import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Button } from "@/components/ui/button";
import { BusinessProfileCard, BusinessProfileForm } from "./business-profile";
import { useBusinessProfile, useSaveBusinessProfile } from "@/hooks/use-real-estate-profile";
import { emptyBusinessProfile, profileError } from "@/lib/real-estate-profile";
export function BusinessProfileSettings({
  org,
  writable,
  company,
}: {
  org: string;
  writable: boolean;
  company: string;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (k: string) => t(`realEstateDemo.profile.${k}`);
  const query = useBusinessProfile(org),
    save = useSaveBusinessProfile(org);
  const [editing, setEditing] = useState(false);
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer font-semibold">{l("title")}</summary>
      <div className="mt-4 space-y-3">
        {query.isPending ? (
          <p role="status">{l("loading")}</p>
        ) : query.isError ? (
          <div role="alert">
            <p>{l("activation")}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              {l("retry")}
            </Button>
          </div>
        ) : editing ? (
          <BusinessProfileForm
            initial={query.data || emptyBusinessProfile()}
            busy={save.isPending}
            error={save.error ? profileError(save.error) : ""}
            onCancel={() => {
              setEditing(false);
              save.reset();
            }}
            onSave={async (profile, files) => {
              await save.mutateAsync({ profile, files });
              setEditing(false);
            }}
          />
        ) : (
          <>
            <BusinessProfileCard profile={query.data || null} company={company} url="" />
            {writable && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  save.reset();
                  setEditing(true);
                }}
              >
                {l("edit")}
              </Button>
            )}
          </>
        )}
      </div>
    </details>
  );
}
