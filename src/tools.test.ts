import { test } from "node:test";
import assert from "node:assert/strict";
import { consultarStatusFatura, consultarStatusFaturaSchema } from "./tools.js";

test("invoice schema matches the tool contract", () => {
  assert.deepEqual(consultarStatusFaturaSchema, {
    name: "consultar_status_fatura",
    description: "Consulta o status da fatura/pagamento do próprio cliente a partir do identificador informado",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Identificador da fatura" } },
      required: ["id"],
    },
  });
});

test("returns a simulated invoice or a valid not-found result", async () => {
  assert.deepEqual(await consultarStatusFatura({ id: "fat_202509" }), {
    id: "fat_202509", status: "paga", valor: 99.9, vencimento: "2026-09-10",
  });
  for (const id of ["fat_000000", "toString", "__proto__"]) {
    assert.deepEqual(await consultarStatusFatura({ id }), { id, status: "nao_encontrado" });
  }
});

test("rejects missing, blank or non-string identifiers", async () => {
  for (const id of [undefined, null, "", "   ", 123]) {
    await assert.rejects(consultarStatusFatura({ id }), /identificador/i);
  }
});
