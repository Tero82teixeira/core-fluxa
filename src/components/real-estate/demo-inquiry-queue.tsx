import type { DemoProposal } from "@/lib/real-estate-public-demo";
import { followupState } from "@/lib/real-estate-followups";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  actDemoInquiry,
  planDemoReturn,
  logDemoContact,
  closeDemoInquiry,
  reopenDemoInquiry,
  type DemoInquiry,
} from "@/lib/real-estate-demo-inquiries";
export function DemoInquiryQueue({
  rows,
  onChange,
  proposals = [],
  onPreferences,
  onCreate,
  onAttach,
  properties,
}: {
  rows: DemoInquiry[];
  onCreate: () => void;
  onAttach: (request: string, property: string) => void;
  properties: { id: string; title: string; purpose: string }[];
  onPreferences: (id: string) => void;
  proposals?: DemoProposal[];
  onChange: (rows: DemoInquiry[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const l = (key: string) => t(`realEstateDemo.attendance.${key}`);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [closureNotes, setClosureNotes] = useState<Record<string, string>>({});
  const m = (key: string) => t(`realEstateDemo.manual.${key}`);
  const [returnFilter, setReturnFilter] = useState("");
  const [returns, setReturns] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
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
  const demoNow = new Date("2026-10-16T12:00:00Z");
  const saveContact = (id: string, contact: boolean) => {
    try {
      onChange(
        contact
          ? logDemoContact(rows, id, notes[id] || "", returns[id] || "")
          : planDemoReturn(rows, id, returns[id] || ""),
      );
      toast.success(t("demo.table.tempChange"));
    } catch {
      toast.error(l("invalid"));
    }
  };
  const visible = rows.filter(
    (r) =>
      (tab === "queue" || r.startsAt) &&
      (!returnFilter || (!r.closed && followupState(r.nextContactAt, demoNow) === returnFilter)),
  );
  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">{l("intro")}</p>
      <Button onClick={onCreate}>{m("new")}</Button>
      <div className="flex gap-2">
        <Button variant={tab === "queue" ? "default" : "outline"} onClick={() => setTab("queue")}>
          {l("queue")}
        </Button>
        <Button variant={tab === "agenda" ? "default" : "outline"} onClick={() => setTab("agenda")}>
          {l("agenda")}
        </Button>
      </div>
      <Label className="block space-y-2">
        {l("returns")}
        <select
          className="min-h-11 w-full rounded-md border bg-background px-3"
          value={returnFilter}
          onChange={(e) => setReturnFilter(e.target.value)}
        >
          <option value="">{l("allReturns")}</option>
          {["overdue", "today", "future", "none"].map((key) => (
            <option key={key} value={key}>
              {l(`return_${key}`)}
            </option>
          ))}
        </select>
      </Label>
      {visible.map((r) => (
        <article key={r.id} className="space-y-3 rounded-xl border bg-card p-4">
          <h3 className="font-semibold">
            {r.name} · {r.listingId || m("noProperty")}
          </h3>
          <p className="text-sm">
            {r.closed ? m("closed") : l(r.stage)} · {r.phone}
          </p>
          <p className="text-sm">
            {m("origin")}: {m(r.origin || "vitrine")}
          </p>
          {r.closed && (
            <p className="text-sm">
              {m("reason")}: {m(r.closureReason || "outro")} · {r.closureNote}
            </p>
          )}
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
          <p
            className={`text-sm ${followupState(r.nextContactAt, demoNow) === "overdue" ? "font-semibold text-destructive" : "text-muted-foreground"}`}
          >
            {l(`return_${followupState(r.nextContactAt, demoNow)}`)}
            {r.nextContactAt &&
              ` · ${new Date(r.nextContactAt).toLocaleString(i18n.resolvedLanguage)}`}
          </p>
          <Button variant="outline" onClick={() => onPreferences(r.id)}>
            {t("realEstateDemo.preferences.open")}
          </Button>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">{l("history")}</summary>
            <div className="mt-3 space-y-2 text-sm">
              <p>
                {l("requestHistory")} · {r.listingId}
              </p>
              {r.startsAt && (
                <p>
                  {l("agenda")}: {new Date(r.startsAt).toLocaleString(i18n.resolvedLanguage)} ·{" "}
                  {l(r.stage)}
                </p>
              )}
              {r.clientKey === "marina" &&
                proposals
                  .filter((p) => p.id === "PROP-DEMO-001")
                  .map((p) => (
                    <p key={p.id}>
                      {l("proposal")}: {p.id} · {p.property} ·{" "}
                      {t(`realEstateDemo.status.${p.status}`)}
                    </p>
                  ))}
              {r.contacts?.map((contact, index) => (
                <p className="whitespace-pre-wrap break-words" key={index}>
                  {new Date(contact.at).toLocaleString(i18n.resolvedLanguage)} · {contact.note}
                </p>
              ))}
            </div>
          </details>
          {!r.closed && (
            <>
              {!r.listingId && (
                <Label className="block space-y-2">
                  {m("attach")}
                  <select
                    className="min-h-11 w-full rounded-md border bg-background px-3"
                    value=""
                    onChange={(e) => onAttach(r.id, e.target.value)}
                  >
                    <option value="">{m("choose")}</option>
                    {properties
                      .filter((p) => p.purpose === r.purpose)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id} · {p.title}
                        </option>
                      ))}
                  </select>
                </Label>
              )}
              <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                <Label className="block space-y-2">
                  {l("returnTime")}
                  <Input
                    type="datetime-local"
                    value={returns[r.id] || ""}
                    onChange={(e) => setReturns({ ...returns, [r.id]: e.target.value })}
                  />
                </Label>
                <Button size="sm" variant="outline" onClick={() => saveContact(r.id, false)}>
                  {l("saveReturn")}
                </Button>
                <Label className="block space-y-2">
                  {l("conversation")}
                  <Input
                    maxLength={2000}
                    value={notes[r.id] || ""}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  />
                </Label>
                <Button
                  size="sm"
                  disabled={!notes[r.id]?.trim()}
                  onClick={() => saveContact(r.id, true)}
                >
                  {l("logContact")}
                </Button>
                <p className="text-xs text-muted-foreground">{l("contactNote")}</p>
              </div>
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
              {r.listingId && r.assigned && !["realizada", "cancelada"].includes(r.stage) && (
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
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer font-medium">{m("close")}</summary>
                <div className="mt-3 space-y-3">
                  <Label className="block space-y-2">
                    {m("reason")}
                    <select
                      className="min-h-11 w-full rounded-md border bg-background px-3"
                      value={reasons[r.id] || ""}
                      onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })}
                    >
                      <option value="">{m("choose")}</option>
                      {["fechou_negocio", "desistiu", "sem_imovel", "outro"].map((key) => (
                        <option key={key} value={key}>
                          {m(key)}
                        </option>
                      ))}
                    </select>
                  </Label>
                  <Label className="block space-y-2">
                    {m("closureNote")}
                    <Input
                      maxLength={1500}
                      value={closureNotes[r.id] || ""}
                      onChange={(e) => setClosureNotes({ ...closureNotes, [r.id]: e.target.value })}
                    />
                  </Label>
                  <Button
                    variant="outline"
                    onClick={() => {
                      try {
                        onChange(
                          closeDemoInquiry(
                            rows,
                            r.id,
                            reasons[r.id] || "",
                            closureNotes[r.id] || "",
                          ),
                        );
                      } catch {
                        toast.error(m("closureInvalid"));
                      }
                    }}
                  >
                    {m("close")}
                  </Button>
                  <p className="text-xs text-muted-foreground">{m("closeNote")}</p>
                </div>
              </details>
            </>
          )}
          {r.closed && (
            <Button
              variant="outline"
              onClick={() => {
                try {
                  onChange(reopenDemoInquiry(rows, r.id));
                } catch {
                  toast.error(m("duplicate"));
                }
              }}
            >
              {m("reopen")}
            </Button>
          )}
        </article>
      ))}
      {!visible.length && <p>{l("empty")}</p>}
    </section>
  );
}
