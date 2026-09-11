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
