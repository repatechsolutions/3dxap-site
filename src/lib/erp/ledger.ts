import { ean13FromBody } from "./ean13";
import { StockError, type CreateInput, type Item, type MovementKind, type ScanMode, type StockItem } from "./types";

export function nextBarcode(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1 || seq > 99999999999) {
    throw new StockError("invalid_qty");
  }
  return ean13FromBody(`2${String(seq).padStart(11, "0")}`);
}

export function movementForScan(
  mode: ScanMode,
  qty: number,
  balance: number,
): { kind: MovementKind; qty: number } {
  if (!Number.isInteger(qty) || qty === 0 || Math.abs(qty) > 100000) {
    throw new StockError("invalid_qty");
  }
  if (mode === "entrada") {
    if (qty < 0) throw new StockError("invalid_qty");
    return { kind: "entrada", qty };
  }
  if (mode === "saida") {
    if (qty < 0) throw new StockError("invalid_qty");
    if (balance < qty) throw new StockError("insufficient_stock");
    return { kind: "saida", qty: -qty };
  }
  if (balance + qty < 0) throw new StockError("insufficient_stock");
  return { kind: "ajuste", qty };
}

export function planAssemble(
  kits: number,
  components: { componentId: string; qty: number; balance: number }[],
): { componentId: string; qty: number }[] {
  if (!Number.isInteger(kits) || kits <= 0 || kits > 100000) {
    throw new StockError("invalid_qty");
  }
  if (components.length === 0) throw new StockError("empty_kit");
  return components.map((component) => {
    const need = component.qty * kits;
    if (component.balance < need) throw new StockError("insufficient_stock");
    return { componentId: component.componentId, qty: -need };
  });
}

export function validateCreate(input: CreateInput, items: Item[]): void {
  if (input.name.trim() === "") throw new StockError("empty_name");
  if (input.kind !== "simples" && input.kind !== "pacote") throw new StockError("invalid_qty");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) throw new StockError("invalid_qty");
  if (!Number.isInteger(input.minQty) || input.minQty < 0) throw new StockError("invalid_qty");
  if (!Number.isInteger(input.initialQty) || input.initialQty < 0) throw new StockError("invalid_qty");
  if (input.kind === "simples") return;
  if (input.components.length === 0) throw new StockError("empty_kit");
  for (const component of input.components) {
    const item = items.find((row) => row.id === component.componentId);
    if (!item || item.kind !== "simples" || !Number.isInteger(component.qty) || component.qty <= 0) {
      throw new StockError("bad_component");
    }
  }
}

export type Situation = "ok" | "baixo" | "minimo" | "zerado";

export function situation(balance: number, minQty: number): Situation {
  if (balance <= 0) return "zerado";
  if (minQty > 0 && balance < minQty) return "baixo";
  if (minQty > 0 && balance === minQty) return "minimo";
  return "ok";
}

export function isLow(balance: number, minQty: number): boolean {
  return situation(balance, minQty) !== "ok";
}

export function yearMonth(iso: string, now = false): string {
  const date = now ? new Date() : new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(date);
  return parts.slice(0, 7);
}

export function bestSeller(
  items: StockItem[],
  sales: { itemId: string; qty: number }[],
): { name: string; units: number } | null {
  const totals = new Map<string, number>();
  for (const sale of sales) {
    totals.set(sale.itemId, (totals.get(sale.itemId) ?? 0) - sale.qty);
  }
  let bestId = "";
  let bestUnits = 0;
  for (const [id, units] of totals) {
    if (units > bestUnits) {
      bestId = id;
      bestUnits = units;
    }
  }
  if (bestUnits <= 0) return null;
  return { name: items.find((item) => item.id === bestId)?.name ?? "Item", units: bestUnits };
}
