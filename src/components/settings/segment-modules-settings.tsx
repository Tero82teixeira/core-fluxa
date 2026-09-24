import { useMemo, useState } from "react";
import { CheckCircle2, Layers3, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import {
  CORE_MODULES,
  SEGMENT_OPTIONS,
  isFocusedHealthWorkspace,
  moduleAllowedForSegment,
  modulesAvailableForSegment,
  recommendedModulesForSegment,
  recommendedModulesForSubtype,
  sanitizeModulesForSegment,
  segmentByKey,
  subtypeByKey,
  subtypeOptionsForSegment,
  type BusinessSegment,
  type BusinessSubtype,
  type ModuleKey,
} from "@/lib/organization-segments";
import { describeError } from "@/lib/errors";

const managementRoles = new Set(["superadmin", "proprietario", "administrador"]);

export function SegmentModulesSettings() {
  const { organizationId, membership, role, refreshWorkspace } = useWorkspace();
  const settings = membership?.organizations?.organization_settings;
  const currentSegment = (settings?.business_segment as BusinessSegment | null) ?? null;
  const currentSubtype = (settings?.business_subtype as BusinessSubtype | null) ?? null;
  const currentEnabled = sanitizeModulesForSegment(currentSegment, settings?.enabled_modules);
  const focusedHealth = isFocusedHealthWorkspace(settings);
  const [segment, setSegment] = useState<BusinessSegment | null>(currentSegment);
  const [subtype, setSubtype] = useState<BusinessSubtype | null>(currentSubtype);
  const [enabled, setEnabled] = useState<ModuleKey[]>(
    currentEnabled.length
      ? currentEnabled
      : currentSegment
        ? recommendedModulesForSegment(currentSegment)
        : CORE_MODULES,
  );
  const [saving, setSaving] = useState(false);
  const canEdit = Boolean(role && managementRoles.has(role));

  const recommended = useMemo(
    () =>
      segment
        ? subtype
          ? recommendedModulesForSubtype(segment, subtype)
          : recommendedModulesForSegment(segment)
        : CORE_MODULES,
    [segment, subtype],
  );
  const availableModules = useMemo(
    () =>
      modulesAvailableForSegment(segment).filter(
        (module) => !focusedHealth || segment !== "health" || module.group === "health",
      ),
    [focusedHealth, segment],
  );

  const selectSegment = (value: BusinessSegment) => {
    setSegment(value);
    setSubtype(null);
    setEnabled(recommendedModulesForSegment(value));
  };

  const selectSubtype = (value: BusinessSubtype) => {
    if (!segment) return;
    setSubtype(value);
    setEnabled(recommendedModulesForSubtype(segment, value));
  };

  const toggleModule = (key: ModuleKey, checked: boolean) => {
    if (!moduleAllowedForSegment(key, segment)) return;
    setEnabled((current) =>
      checked ? Array.from(new Set([...current, key])) : current.filter((module) => module !== key),
    );
  };

  const save = async () => {
    if (!organizationId || !segment || !subtype || saving) return;
    setSaving(true);
    try {
      const safeEnabled = sanitizeModulesForSegment(segment, enabled);
      const { error } = await (supabase as any).rpc("update_organization_segment", {
        _organization_id: organizationId,
        _segment: segment,
        _subtype: subtype,
        _enabled_modules: safeEnabled,
      });
      if (error) throw error;
      await refreshWorkspace();
      toast.success("Segmento e módulos atualizados.");
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/70 shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" aria-hidden />
            Segmento da empresa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SEGMENT_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = segment === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => selectSegment(option.key)}
                  className={`rounded-2xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-70 ${
                    selected
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border/70 bg-card hover:border-primary/35"
                  }`}
                >
                  <span
                    className={`grid size-10 place-items-center rounded-xl ${
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="mt-3 block font-semibold">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
          {segment && (
            <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-sm">
              <span className="font-medium">Configuração recomendada:</span>{" "}
              {segmentByKey(segment)?.label}. Ao trocar o segmento, os módulos recomendados são
              selecionados automaticamente e podem ser ajustados abaixo.
            </div>
          )}
        </CardContent>
      </Card>

      {segment && (
        <Card className="rounded-2xl border-border/70 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Tipo de operação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subtypeOptionsForSegment(segment).map((option) => {
                const selected = subtype === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => selectSubtype(option.key)}
                    className={`rounded-2xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-70 ${
                      selected
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border/70 bg-card hover:border-primary/35"
                    }`}
                  >
                    <span className="block font-semibold">{option.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
            {subtype && (
              <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-sm">
                Perfil atual:{" "}
                <span className="font-medium">{subtypeByKey(segment, subtype)?.label}</span>.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-border/70 shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers3 className="size-4 text-primary" aria-hidden />
            Módulos da operação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-sm text-muted-foreground">
              Ative apenas o que faz sentido para esta organização. Desativar um módulo não exclui
              os dados já existentes.
            </p>
          </div>

          <div className="space-y-3">
            {availableModules.map((module) => {
              const checked = enabled.includes(module.key);
              const isRecommended = recommended.includes(module.key);
              const disabled = !canEdit || !module.available;
              return (
                <div
                  key={module.key}
                  className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{module.label}</p>
                      {isRecommended && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="size-3" aria-hidden />
                          Recomendado
                        </Badge>
                      )}
                      {!module.available && (
                        <Badge variant="outline" className="gap-1">
                          <Lock className="size-3" aria-hidden />
                          Em breve
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
                  </div>
                  <Switch
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(value) => toggleModule(module.key, value)}
                    aria-label={`Ativar ${module.label}`}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={!canEdit || !segment || !subtype || saving}>
              {saving ? "Salvando…" : "Salvar segmento e módulos"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
