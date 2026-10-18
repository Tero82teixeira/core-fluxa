import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  businessWhatsapp,
  profileValues,
  type BusinessProfile,
  type PublicBusinessProfile,
} from "@/lib/real-estate-profile";
export function BusinessProfileCard({
  profile,
  company,
  whatsapp,
  url,
  demo = false,
  onDemoContact,
}: {
  profile: PublicBusinessProfile | null;
  company: string;
  whatsapp?: string;
  url: string;
  demo?: boolean;
  onDemoContact?: () => void;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (k: string) => t(`realEstateDemo.profile.${k}`);
  let contact: string | undefined;
  try {
    if (whatsapp) contact = businessWhatsapp(whatsapp, url);
  } catch {
    /* Contato ausente não gera um link inválido. */
  }
  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center"
      aria-label={l("title")}
    >
      {profile?.logo_url && (
        <img
          src={profile.logo_url}
          alt={`${l("logo")}: ${company}`}
          className="h-20 w-24 shrink-0 object-contain"
          referrerPolicy="no-referrer"
        />
      )}
      {profile?.agent_photo_url && (
        <img
          src={profile.agent_photo_url}
          alt={profile.agent_name}
          className="size-20 shrink-0 rounded-full object-cover"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="break-words font-semibold">{company}</h2>
        {profile?.company_creci && (
          <p className="break-words text-sm">
            {l("companyCreci")}: {profile.company_creci}
          </p>
        )}
        {profile?.agent_name && <p className="break-words font-medium">{profile.agent_name}</p>}
        {profile?.agent_creci && (
          <p className="break-words text-sm">
            {l("agentCreci")}: {profile.agent_creci}
          </p>
        )}
        {profile?.bio && (
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {profile.bio}
          </p>
        )}
      </div>
      <div className="min-w-0 space-y-2 sm:max-w-xs">
        {demo ? (
          <Button type="button" onClick={onDemoContact}>
            {l("whatsapp")}
          </Button>
        ) : contact ? (
          <Button asChild>
            <a href={contact} target="_blank" rel="noopener noreferrer">
              {l("whatsapp")}
            </a>
          </Button>
        ) : null}
        {(demo || contact) && (
          <p className="text-sm text-muted-foreground">{l(demo ? "demoContact" : "audioHint")}</p>
        )}
      </div>
    </section>
  );
}
export function BusinessProfileForm({
  initial,
  busy = false,
  error = "",
  onSave,
  onCancel,
}: {
  initial: BusinessProfile;
  busy?: boolean;
  error?: string;
  onSave: (
    profile: BusinessProfile,
    files: { logo: File | null; agent: File | null },
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (k: string) => t(`realEstateDemo.profile.${k}`);
  const [profile, setProfile] = useState(initial),
    [files, setFiles] = useState<{ logo: File | null; agent: File | null }>({
      logo: null,
      agent: null,
    }),
    [invalid, setInvalid] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          profileValues(profile);
          if (files.agent && !profile.agent_name.trim()) throw Error();
          setInvalid(false);
          await onSave(profile, files);
        } catch {
          setInvalid(true);
        }
      }}
    >
      <p className="text-sm text-muted-foreground">{l("publicHint")}</p>
      <fieldset disabled={busy} className="space-y-3">
        {(
          [
            ["agent_name", "agentName", 120],
            ["agent_creci", "agentCreci", 40],
            ["company_creci", "companyCreci", 40],
          ] as const
        ).map(([key, label, max]) => (
          <Label key={key} className="block">
            {l(label)}
            <Input
              className="mt-1"
              maxLength={max}
              value={profile[key]}
              onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
            />
          </Label>
        ))}
        <Label className="block">
          {l("bio")}
          <Textarea
            className="mt-1"
            maxLength={500}
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </Label>
        {(
          [
            ["logo", "logo_path", "logo_url", "logo"],
            ["agent", "agent_photo_path", "agent_photo_url", "photo"],
          ] as const
        ).map(([slot, key, url, label]) => (
          <div key={slot} className="space-y-2">
            <Label htmlFor={`profile-${slot}`}>{l(label)}</Label>
            {profile[url] && (
              <img src={profile[url]} alt={l(label)} className="h-20 w-24 rounded object-contain" />
            )}
            <Input
              id={`profile-${slot}`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setFiles({ ...files, [slot]: e.target.files?.[0] || null });
              }}
            />
            {(profile[key] || files[slot]) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setProfile({ ...profile, [key]: null, [url]: undefined });
                  setFiles({ ...files, [slot]: null });
                  const input = document.getElementById(
                    `profile-${slot}`,
                  ) as HTMLInputElement | null;
                  if (input) input.value = "";
                }}
              >
                {l("remove")}
              </Button>
            )}
            {files[slot] && <p className="break-words text-sm">{files[slot]!.name}</p>}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{l("imageHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy}>{l(busy ? "saving" : "save")}</Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {l("cancel")}
          </Button>
        </div>
      </fieldset>
      {(invalid || error) && (
        <p role="alert" className="text-sm">
          {l(error || "invalid")}
        </p>
      )}
    </form>
  );
}
