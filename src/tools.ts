import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isNotFoundError } from "./errors.js";
import type { ToolSchema } from "./providers/llm.js";

export const consultarStatusFaturaSchema: ToolSchema = {
  name: "consultar_status_fatura",
  description:
    "Consulta o status da fatura/pagamento do próprio cliente a partir do CPF e do identificador ou mês de referência informados",
  parameters: {
    type: "object",
    properties: {
      cpf: {
        type: "string",
        description: "CPF do cliente, com ou sem pontuação (ex.: 12345678900 ou 123.456.789-00)",
      },
      id: {
        type: "string",
        description:
          "Identificador da fatura (ex.: fat_202609) ou o mês de referência como o cliente naturalmente diria " +
          "(ex.: 'setembro', 'setembro de 2026', '09/2026', '2026-09')",
      },
    },
    required: ["cpf", "id"],
  },
};

type SimulatedInvoice = {
  id: string;
  cpf: string;
  status: "pendente" | "paga" | "vencida";
  valor: number; // Reais.
  vencimento: string;
};

const invoices: SimulatedInvoice[] = [
  // 111.111.111-11 — Plano Básico
  { id: "fat_202609", cpf: "11111111111", status: "paga", valor: 79.9, vencimento: "2026-09-10" },
  { id: "fat_202610", cpf: "11111111111", status: "pendente", valor: 79.9, vencimento: "2026-10-10" },
  { id: "fat_202608", cpf: "11111111111", status: "vencida", valor: 79.9, vencimento: "2026-08-10" },
  // 222.222.222-22 — Plano Turbo
  { id: "fat_202609", cpf: "22222222222", status: "paga", valor: 99.9, vencimento: "2026-09-10" },
  { id: "fat_202610", cpf: "22222222222", status: "pendente", valor: 99.9, vencimento: "2026-10-10" },
  { id: "fat_202608", cpf: "22222222222", status: "paga", valor: 99.9, vencimento: "2026-08-10" },
  // 333.333.333-33 — Plano Fibra Max
  { id: "fat_202609", cpf: "33333333333", status: "vencida", valor: 149.9, vencimento: "2026-09-10" },
  { id: "fat_202610", cpf: "33333333333", status: "pendente", valor: 149.9, vencimento: "2026-10-10" },
  { id: "fat_202608", cpf: "33333333333", status: "paga", valor: 149.9, vencimento: "2026-08-10" },
];

function normalizeCpf(raw: string): string {
  return raw.replace(/\D/g, "");
}

function requireText(value: unknown, errorMessage: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(errorMessage);
  }
  return value.trim();
}

const DEFAULT_INVOICE_YEAR = "2026";

const MONTHS_PT: Record<string, string> = {
  janeiro: "01",
  fevereiro: "02",
  março: "03",
  marco: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

function resolveInvoiceId(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (/^fat_\d{6}$/.test(value)) return value;

  const isoMatch = value.match(/^(\d{4})-(\d{2})$/);
  if (isoMatch) return `fat_${isoMatch[1]}${isoMatch[2]}`;

  const slashMatch = value.match(/^(\d{2})\/(\d{4})$/);
  if (slashMatch) return `fat_${slashMatch[2]}${slashMatch[1]}`;

  for (const [name, mm] of Object.entries(MONTHS_PT)) {
    if (value.includes(name)) {
      const year = value.match(/\d{4}/)?.[0] ?? DEFAULT_INVOICE_YEAR;
      return `fat_${year}${mm}`;
    }
  }

  return raw.trim();
}

export async function consultarStatusFatura(
  args: Record<string, unknown>,
): Promise<
  Omit<SimulatedInvoice, "cpf"> | { id: string; status: "nao_encontrado" }
> {
  const rawId = requireText(
    args.id,
    "Peça ao cliente o identificador ou o mês da fatura antes de consultar.",
  );
  const rawCpf = requireText(
    args.cpf,
    "Peça ao cliente o CPF antes de consultar a fatura.",
  );
  const cpf = normalizeCpf(rawCpf);
  const id = resolveInvoiceId(rawId);
  const invoice = invoices.find(
    (invoice) => invoice.id === id && invoice.cpf === cpf,
  );
  if (!invoice) return { id, status: "nao_encontrado" };
  const { cpf: _cpf, ...rest } = invoice;
  return rest;
}

export const abrirTicketSchema: ToolSchema = {
  name: "abrir_ticket",
  description:
    "Abre um chamado sobre dúvida de cobrança com o assunto e descrição do problema relatado pelo cliente",
  parameters: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Resumo curto do problema" },
      description: {
        type: "string",
        description:
          "Descrição detalhada do problema, incluindo dados relevantes já mencionados na conversa (ex.: id de fatura)",
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

const defaultTicketsPath = fileURLToPath(
  new URL("../data/tickets.json", import.meta.url),
);

let ticketQueue: Promise<unknown> = Promise.resolve();

async function appendTicket(
  ticket: SupportTicket,
  ticketsPath: string,
): Promise<void> {
  let tickets: SupportTicket[] = [];
  try {
    tickets = JSON.parse(
      await readFile(ticketsPath, "utf8"),
    ) as SupportTicket[];
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }
  if (!Array.isArray(tickets)) {
    throw new Error("data/tickets.json deve conter uma lista de chamados.");
  }

  await mkdir(dirname(ticketsPath), { recursive: true });
  const temporaryPath = `${ticketsPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify([...tickets, ticket], null, 2)}\n`,
      "utf8",
    );
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
  const subject = requireText(
    args.subject,
    "Peça ao cliente um assunto para o chamado antes de abrir.",
  );
  const description = requireText(
    args.description,
    "Peça ao cliente uma descrição do problema antes de abrir.",
  );

  const createdAt = Date.now();
  const ticket: SupportTicket = {
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
