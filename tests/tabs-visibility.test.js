import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tabs = readFileSync("src/components/ui/tabs.tsx", "utf8");
const reports = readFileSync("src/routes/_authenticated/relatorios.tsx", "utf8");

test("shared tabs visibly distinguish inactive, hover and selected states", () => {
  assert.match(tabs, /border-border\/80 bg-muted\/70/);
  assert.match(tabs, /hover:bg-background\/80 hover:text-foreground/);
  assert.match(tabs, /data-\[state=active\]:bg-primary/);
  assert.match(tabs, /data-\[state=active\]:text-primary-foreground/);
});

test("reports explains its internal menu and highlights the available choices", () => {
  assert.match(reports, /Escolha o relatório que deseja visualizar/);
  assert.match(reports, /border-primary\/20 bg-primary\/5/);
  assert.match(reports, /REPORT_TYPES/);
  assert.match(reports, /requestedReport/);
});
