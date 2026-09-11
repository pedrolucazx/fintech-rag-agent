import fs, { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abrirTicket,
  abrirTicketSchema,
  consultarStatusFatura,
  consultarStatusFaturaSchema,
} from "./tools.js";

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

test("ticket schema matches the tool contract", () => {
  assert.deepEqual(abrirTicketSchema, {
    name: "abrir_ticket",
    description: "Abre um chamado sobre dúvida de cobrança com o assunto e descrição do problema relatado pelo cliente",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Resumo curto do problema" },
        description: {
          type: "string",
          description: "Descrição detalhada do problema, incluindo dados relevantes já mencionados na conversa (ex.: id de fatura)",
        },
      },
      required: ["subject", "description"],
    },
  });
});

test("appends tickets with the conversation id and returns its identifier", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tickets-test-"));
  const ticketsPath = join(directory, "tickets.json");
  try {
    const [first, second] = await Promise.all([
      abrirTicket(
        { subject: "Cobrança duplicada", description: "A fatura fat_202509 foi debitada duas vezes." },
        "chat-test", ticketsPath,
      ),
      abrirTicket(
        { subject: "Boleto indisponível", description: "A segunda via não aparece no aplicativo." },
        "chat-test", ticketsPath,
      ),
    ]);
    const tickets = JSON.parse(await readFile(ticketsPath, "utf8")) as Array<Record<string, unknown>>;

    assert.equal(tickets.length, 2);
    assert.deepEqual(tickets.map(({ id, createdAt }) => ({ id, createdAt })), [first, second]);
    assert.equal(tickets[0].subject, "Cobrança duplicada");
    assert.equal(tickets[0].description, "A fatura fat_202509 foi debitada duas vezes.");
    assert.equal(tickets[0].chatId, "chat-test");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects tickets without a meaningful subject or description", async () => {
  await assert.rejects(abrirTicket({ subject: "", description: "detalhes" }), /assunto/i);
  await assert.rejects(abrirTicket({ subject: "Assunto", description: " " }), /descrição/i);
});

test("failed ticket write preserves existing tickets and the queue recovers", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "tickets-failure-"));
  const ticketsPath = join(directory, "tickets.json");
  const original = '[{"id":"existing-ticket"}]\n';
  await writeFile(ticketsPath, original);
  const actualWrite = fs.writeFile;
  const failure = t.mock.method(fs, "writeFile", async (path: Parameters<typeof fs.writeFile>[0]) => {
    await actualWrite(path, "partial");
    throw new Error("simulated disk failure");
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(
      abrirTicket({ subject: "Assunto", description: "Detalhes" }, "chat-test", ticketsPath),
      /simulated disk failure/,
    );
    assert.equal(await readFile(ticketsPath, "utf8"), original);
    assert.deepEqual(await readdir(directory), ["tickets.json"]);
    failure.mock.restore();
    syncBuiltinESMExports();
    await abrirTicket({ subject: "Assunto", description: "Detalhes" }, "chat-test", ticketsPath);
    assert.equal(JSON.parse(await readFile(ticketsPath, "utf8")).length, 2);
  } finally {
    failure.mock.restore();
    syncBuiltinESMExports();
    await rm(directory, { recursive: true, force: true });
  }
});
