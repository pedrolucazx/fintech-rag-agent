import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ToolSchema } from "./llm.js";

export const consultarStatusFaturaSchema: ToolSchema = {
  name: "consultar_status_fatura",
  description: "Consulta o status da fatura/pagamento do próprio cliente a partir do identificador informado",
  parameters: {
    type: "object",
    properties: { id: { type: "string", description: "Identificador da fatura" } },
    required: ["id"],
  },
};

type SimulatedInvoice = {
  id: string;
  status: "pendente" | "paga" | "vencida";
  valor: number; // Reais.
  vencimento: string;
};

const invoices: SimulatedInvoice[] = [
  { id: "fat_202509", status: "paga", valor: 99.9, vencimento: "2026-09-10" },
  { id: "fat_202610", status: "pendente", valor: 99.9, vencimento: "2026-10-10" },
  { id: "fat_202608", status: "vencida", valor: 99.9, vencimento: "2026-08-10" },
];

export async function consultarStatusFatura({ id }: Record<string, unknown>): Promise<
  SimulatedInvoice | { id: string; status: "nao_encontrado" }
> {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Peça ao cliente o identificador da fatura antes de consultar.");
  }
  const invoice = invoices.find((invoice) => invoice.id === id);
  return invoice ? { ...invoice } : { id, status: "nao_encontrado" };
}

export const abrirTicketSchema: ToolSchema = {
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
};

type SupportTicket = {
  id: string;
  subject: string;
  description: string;
  chatId: string;
  createdAt: number;
};

const ticketsPath = resolve(process.cwd(), "data/tickets.json");

export async function abrirTicket(
  args: Record<string, unknown>,
  chatId = "",
): Promise<{ id: string; createdAt: number }> {
  const { subject, description } = args;
  if (typeof subject !== "string" || !subject.trim()) {
    throw new Error("Peça ao cliente um assunto para o chamado antes de abrir.");
  }
  if (typeof description !== "string" || !description.trim()) {
    throw new Error("Peça ao cliente uma descrição do problema antes de abrir.");
  }

  const createdAt = Date.now();
  const ticket: SupportTicket = {
    id: `tk_${randomUUID().replaceAll("-", "").slice(0, 6)}`,
    subject: subject.trim(),
    description: description.trim(),
    chatId,
    createdAt,
  };

  let tickets: SupportTicket[] = [];
  try {
    tickets = JSON.parse(await readFile(ticketsPath, "utf8")) as SupportTicket[];
  } catch (err) {
    if (!(err instanceof Error && "code" in err && err.code === "ENOENT")) {
      throw err;
    }
  }
  if (!Array.isArray(tickets)) {
    throw new Error("data/tickets.json deve conter uma lista de chamados.");
  }

  await mkdir(dirname(ticketsPath), { recursive: true });
  await writeFile(ticketsPath, `${JSON.stringify([...tickets, ticket], null, 2)}\n`, "utf8");
  return { id: ticket.id, createdAt };
}
