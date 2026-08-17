import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { permissionsForRole, canManageFinance, canViewFinance } from "../src/lib/access-control.ts";

describe("matriz central de permissões", () => {
  const expected = {
    proprietario: [true, true, true, true, true, true, true],
    administrador: [true, true, true, true, true, true, true],
    gestor: [true, true, false, true, false, false, true],
    operacional: [false, false, false, true, false, false, true],
    visualizador: [false, false, false, false, false, false, false],
  };
  for (const [role, values] of Object.entries(expected)) {
    test(role, () => {
      const p = permissionsForRole(role);
      assert.deepEqual(
        [canViewFinance(role), canManageFinance(role), p.canManageTeam, p.canUploadDocuments, p.canReviewDocuments, p.canArchiveDocuments, p.canExportReports],
        values,
      );
    });
  }
  for (const role of ["atendimento", "financeiro", "cliente_externo"])
    test(`${role} permanece reservado`, () => assert.equal(permissionsForRole(role).canCreate, false));
});
