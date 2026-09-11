import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalIndex } from "vectra";
import { embed } from "./embeddings.js";
import { retrieve } from "./rag.js";

async function buildFixtureIndex(): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), "rag-test-"));
  const index = new LocalIndex(dir);
  await index.createIndex();

  const fixtures = [
    {
      source: "regulamentacao-pix",
      path: "regulamentacao-pix/01-chaves-pix.md",
      text: "Existem quatro tipos de chave PIX: CPF ou CNPJ, e-mail, número de celular e chave aleatória.",
    },
    {
      source: "faturamento-conectanet",
      path: "faturamento-conectanet/01-formas-de-pagamento.md",
      text: "Você pode pagar sua fatura da ConectaNet via PIX, boleto, cartão de crédito ou débito automático.",
    },
  ];

  const items = [];
  for (const fixture of fixtures) {
    items.push({ vector: await embed(fixture.text), metadata: fixture });
  }
  await index.batchInsertItems(items);

  return dir;
}

test("retrieve returns the chunk from the expected source for a known question", async () => {
  const dir = await buildFixtureIndex();
  try {
    const results = await retrieve("quais tipos de chave PIX existem?", 5, dir);
    assert.ok(results.length > 0);
    assert.equal(results[0]?.source, "regulamentacao-pix");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("retrieve returns an empty list for a question outside the corpus", async () => {
  const dir = await buildFixtureIndex();
  try {
    const results = await retrieve("por que minha internet caiu ontem?", 5, dir);
    assert.deepEqual(results, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
