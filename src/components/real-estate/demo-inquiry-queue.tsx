import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actDemoInquiry, type DemoInquiry } from "@/lib/real-estate-demo-inquiries";
export function DemoInquiryQueue({
  rows,
  onChange,
}: {
  rows: DemoInquiry[];
  onChange: (rows: DemoInquiry[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const l = (key: string) => t(`realEstateDemo.attendance.${key}`);
  const [tab, setTab] = useState("queue");
  const [times, setTimes] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const act = (id: string, action: Parameters<typeof actDemoInquiry>[2], value = "") => {
    try {
      onChange(actDemoInquiry(rows, id, action, value));
      toast.success(t("demo.table.tempChange"));
    } catch (e) {
      toast.error(l(e instanceof Error && e.message === "DEMO_OVERLAP" ? "overlap" : "invalid"));
    }
  };
  const visible = rows.filter((r) => tab === "queue" || r.startsAt);
  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">{l("intro")}</p>
      <div className="flex gap-2">
        <Button variant={tab === "queue" ? "default" : "outline"} onClick={() => setTab("queue")}>
          {l("queue")}
        </Button>
        <Button variant={tab === "agenda" ? "default" : "outline"} onClick={() => setTab("agenda")}>
          {l("agenda")}
        </Button>
      </div>
      {visible.map((r) => (
        <article key={r.id} className="space-y-3 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">
            {r.name} · {r.listingId}
          </h3>
          <p className="text-sm">
            {l(r.stage)} · {r.phone}
          </p>
          <p className="text-sm">
            {l("preference")}: {r.preference || "—"} · {l(r.kind)}
          </p>
          <p className="text-sm">{r.assigned ? l("assigned") : l("unassigned")}</p>
          {r.startsAt && (
            <p>
              {new Date(r.startsAt).toLocaleString(i18n.resolvedLanguage)} ·{" "}
              {r.confirmed ? l("confirmed") : l("pending")}
            </p>
          )}
          {r.outcome && <p className="text-sm">{r.outcome}</p>}
          <div className="flex flex-wrap gap-2">
            {!r.assigned && (
              <Button size="sm" onClick={() => act(r.id, "assign")}>
                {l("assign")}
              </Button>
            )}
            {r.stage === "agendada" && !r.confirmed && (
              <Button size="sm" variant="outline" onClick={() => act(r.id, "confirm")}>
                {l("confirm")}
              </Button>
            )}
          </div>
          {r.assigned && !["realizada", "cancelada"].includes(r.stage) && (
            <div className="flex flex-wrap items-end gap-2">
              <Label className="space-y-2">
                {l("time")}
                <Input
                  type="datetime-local"
                  value={times[r.id] || ""}
                  onChange={(e) => setTimes({ ...times, [r.id]: e.target.value })}
                />
              </Label>
              <Button
                size="sm"
                disabled={!times[r.id]}
                onClick={() => act(r.id, "schedule", times[r.id])}
              >
                {l(r.startsAt ? "reschedule" : "schedule")}
              </Button>
            </div>
          )}
          {r.stage === "agendada" && (
            <div className="space-y-2">
              <Label className="block space-y-2">
                {l("outcome")}
                <Input
                  maxLength={500}
                  value={outcomes[r.id] || ""}
                  onChange={(e) => setOutcomes({ ...outcomes, [r.id]: e.target.value })}
                />
              </Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!outcomes[r.id]?.trim()}
                  onClick={() => act(r.id, "realizada", outcomes[r.id])}
                >
                  {l("finish")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!outcomes[r.id]?.trim()}
                  onClick={() => act(r.id, "cancelada", outcomes[r.id])}
                >
                  {l("cancel")}
                </Button>
              </div>
            </div>
          )}
        </article>
      ))}
      {!visible.length && <p>{l("empty")}</p>}
    </section>
  );
}
