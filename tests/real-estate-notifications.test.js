import assert from "node:assert/strict";
import test from "node:test";
import { realEstateAlertSearch } from "../src/lib/real-estate-notifications.ts";
import {
  filterNotifications,
  notificationDestination,
  visibleForFocusedHealth,
} from "../src/lib/notifications.ts";

test("aviso imobiliário abre a fila do tipo e imóvel corretos", () => {
  for (const pendencia of ["proposta", "contrato", "repasse"]) {
    const action_url = `/imobiliaria/imoveis?pendencia=${pendencia}&busca=IMOV-002`;
    const destination = notificationDestination({
      action_url,
      entity_id: null,
      entity_type: "real_estate_contract",
    });
    const url = new URL(destination, "https://fluxa.test");
    assert.deepEqual(realEstateAlertSearch(Object.fromEntries(url.searchParams)), {
      pendencia,
      busca: "IMOV-002",
    });
  }
});
test("parâmetros desconhecidos não selecionam fila nem busca inválida", () => {
  assert.deepEqual(realEstateAlertSearch({ pendencia: "invalida", busca: "IMOV-002" }), {});
  assert.deepEqual(realEstateAlertSearch({}), {});
  for (const busca of ["https://external.test", "../privado", [], "a".repeat(121)])
    assert.deepEqual(realEstateAlertSearch({ pendencia: "contrato", busca }), {
      pendencia: "contrato",
      busca: undefined,
    });
});
test("categoria imobiliária filtra a Central e não entra no ambiente focado de Saúde", () => {
  const rows = [
    { id: "1", kind: "real_estate", archived_at: null },
    { id: "2", kind: "health", archived_at: null },
  ];
  assert.deepEqual(
    filterNotifications(rows, "real_estate").map((r) => r.id),
    ["1"],
  );
  assert.equal(visibleForFocusedHealth(rows[0]), false);
});
