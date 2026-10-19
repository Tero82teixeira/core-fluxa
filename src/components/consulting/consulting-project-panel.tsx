import { useTranslation } from "react-i18next";
import { ConsultingProjectCard } from "./consulting-project-card";
import { ConsultingDeliveriesCard } from "./consulting-deliveries-card";
import {
  useUpdateProcess,
  useCreateChecklistItem,
  useUpdateChecklistItem,
} from "@/hooks/use-mutations";
import type { ProcessRow, ChecklistRow } from "@/hooks/use-operations";
import { consultingProjectPayload, consultingDeliveryPayload } from "@/lib/consulting-project";
import { formatDate } from "@/lib/format";

export function ConsultingProjectPanel({
  organizationId,
  project,
  canEdit,
}: {
  organizationId: string | null;
  project: ProcessRow;
  canEdit: boolean;
}) {
  const save = useUpdateProcess(organizationId);
  return (
    <ConsultingProjectCard
      key={project.id}
      values={{
        title: project.title ?? "",
        description: project.description ?? "",
        owner_name: project.owner_name ?? "",
        due_date: project.due_date ?? "",
      }}
      canEdit={canEdit && !project.archived_at}
      formatDate={formatDate}
      onSave={async (values) => {
        if (!canEdit || project.archived_at) throw new Error("NO_PERMISSION");
        const payload=consultingProjectPayload(values);
        const changed=Object.fromEntries(Object.entries(payload).filter(([key,value])=>project[key as keyof typeof payload]!==value));
        if(Object.keys(changed).length)await save.mutateAsync({ id: project.id, values: changed });
      }}
    />
  );
}
export function ConsultingProjectDeliveries({
  organizationId,
  project,
  items,
  canEdit,
}: {
  organizationId: string | null;
  project: ProcessRow;
  items: ChecklistRow[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const create = useCreateChecklistItem(organizationId, project.id),
    update = useUpdateChecklistItem(organizationId, project.id);
  return (
    <ConsultingDeliveriesCard
      key={project.id}
      items={items.map((item) => ({
        ...item,
        description: item.description ?? "",
        assignee_name: item.assignee_name ?? "",
        due_date: item.due_date ?? "",
      }))}
      today={new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())}
      canEdit={canEdit && !project.archived_at}
      formatDate={formatDate}
      onSave={async (values, id) => {
        if (!canEdit || project.archived_at) throw new Error("NO_PERMISSION");
        const payload = consultingDeliveryPayload(values);
        if (id) {
          await update.mutateAsync({
            id,
            values: payload,
            movement: `Entrega "${values.title.trim()}": ${t(`consultingProject.statuses.${values.status}`)}.`,
          });
        } else {
          await create.mutateAsync({
            ...payload,
            position: items.reduce((max, item) => Math.max(max, item.position), -1) + 1,
          });
        }
      }}
    />
  );
}
