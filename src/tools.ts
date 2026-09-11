import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

function requireText(value: unknown, errorMessage: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(errorMessage);
  }
  return value.trim();
}

export async function consultarStatusFatura(args: Record<string, unknown>): Promise<
  SimulatedInvoice | { id: string; status: "nao_encontrado" }
> {
  const id = requireText(args.id, "Peça ao cliente o identificador da fatura antes de consultar.");
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

const defaultTicketsPath = fileURLToPath(new URL("../data/tickets.json", import.meta.url));

// ponytail: in-process write queue only — concurrent tickets from separate bot
// instances/replicas can still race on the shared file. Move to a real store
// (sqlite/DB) if this ever runs as more than one process.
let ticketQueue: Promise<unknown> = Promise.resolve();

async function appendTicket(ticket: SupportTicket, ticketsPath: string): Promise<void> {
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
  const temporaryPath = `${ticketsPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify([...tickets, ticket], null, 2)}\n`, "utf8");
    await rename(temporaryPath, ticketsPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function abrirTicket(
  args: Record<string, unknown>,
  chatId = "",
  ticketsPath = defaultTicketsPath,
): Promise<{ id: string; createdAt: number }> {
  const subject = requireText(args.subject, "Peça ao cliente um assunto para o chamado antes de abrir.");
  const description = requireText(args.description, "Peça ao cliente uma descrição do problema antes de abrir.");

  const createdAt = Date.now();
  const ticket: SupportTicket = {
    // ponytail: 6 hex chars (~16M combinations) unchecked against existing
    // tickets — collision risk is negligible at this project's scale; add a
    // uniqueness check if ticket volume ever grows enough to matter.
    id: `tk_${randomUUID().replaceAll("-", "").slice(0, 6)}`,
    subject,
    description,
    chatId,
    createdAt,
  };

  const run = ticketQueue.then(() => appendTicket(ticket, ticketsPath));
  ticketQueue = run.catch(() => {});
  await run;
  return { id: ticket.id, createdAt };
}
