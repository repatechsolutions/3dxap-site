import { getSupabase, hasCloudBackend } from "../store";
import {
  movementForScan,
  nextBarcode,
  planAssemble,
  validateCreate,
  yearMonth,
} from "./ledger";
import {
  StockError,
  type CreateInput,
  type Movement,
  type MovementKind,
  type Sale,
  type ScanHit,
  type ScanMode,
  type Snapshot,
  type StockItem,
} from "./types";

const STORAGE_KEY = "3dxap-erp-stock-v1";

type MemoryState = {
  seq: number;
  id: number;
  items: StockItem[];
  movements: Movement[];
};

function emptyState(): MemoryState {
  return { seq: 1, id: 1, items: [], movements: [] };
}

function loadState(): MemoryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as MemoryState;
    if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.movements)) return emptyState();
    return parsed;
  } catch {
    return emptyState();
  }
}

function saveState(state: MemoryState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function snapshotFrom(state: MemoryState): Snapshot {
  const month = yearMonth(new Date().toISOString(), true);
  const sales: Sale[] = state.movements
    .filter((movement) => movement.kind === "saida" && yearMonth(movement.createdAt) === month)
    .map((movement) => ({ itemId: movement.itemId, qty: movement.qty }));
  return {
    items: state.items.map((item) => ({ ...item, components: item.components.map((row) => ({ ...row })) })),
    movements: [...state.movements].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 40),
    sales,
  };
}

function balanceOf(state: MemoryState, itemId: string): number {
  return state.movements.filter((movement) => movement.itemId === itemId).reduce((sum, movement) => sum + movement.qty, 0);
}

function pushMovement(
  state: MemoryState,
  itemId: string,
  kind: MovementKind,
  qty: number,
  note: string,
  actorEmail: string,
) {
  state.movements.push({
    id: `mv_${state.id}`,
    itemId,
    kind,
    qty,
    note,
    actorEmail,
    createdAt: new Date().toISOString(),
  });
  state.id += 1;
}

function refreshBalances(state: MemoryState) {
  for (const item of state.items) item.balance = balanceOf(state, item.id);
}

const memoryApi = {
  async load(): Promise<Snapshot> {
    return snapshotFrom(loadState());
  },
  async createItem(input: CreateInput, actorEmail: string): Promise<StockItem> {
    const state = loadState();
    validateCreate(input, state.items);
    const item: StockItem = {
      id: `it_${state.id}`,
      name: input.name.trim(),
      kind: input.kind,
      priceCents: input.priceCents,
      minQty: input.minQty,
      barcode: nextBarcode(state.seq),
      active: true,
      balance: 0,
      components: input.kind === "pacote" ? input.components.map((row) => ({ ...row })) : [],
    };
    state.id += 1;
    state.seq += 1;
    state.items.push(item);
    if (input.initialQty > 0) {
      pushMovement(state, item.id, "entrada", input.initialQty, "quantidade inicial", actorEmail);
    }
    refreshBalances(state);
    saveState(state);
    return state.items.find((row) => row.id === item.id) ?? item;
  },
  async scan(barcode: string, mode: ScanMode, qty: number, actorEmail: string): Promise<ScanHit> {
    const state = loadState();
    const item = state.items.find((row) => row.barcode === barcode.trim());
    if (!item) throw new StockError("unknown_barcode");
    const move = movementForScan(mode, qty, balanceOf(state, item.id));
    pushMovement(state, item.id, move.kind, move.qty, "", actorEmail);
    refreshBalances(state);
    saveState(state);
    const updated = state.items.find((row) => row.id === item.id)!;
    return { id: updated.id, name: updated.name, kind: move.kind, barcode: updated.barcode, balance: updated.balance };
  },
  async assemble(kitId: string, kits: number, actorEmail: string): Promise<ScanHit> {
    const state = loadState();
    const kit = state.items.find((row) => row.id === kitId);
    if (!kit || kit.kind !== "pacote") throw new StockError("bad_component");
    const planned = planAssemble(
      kits,
      kit.components.map((component) => ({
        componentId: component.componentId,
        qty: component.qty,
        balance: balanceOf(state, component.componentId),
      })),
    );
    for (const move of planned) {
      pushMovement(state, move.componentId, "montagem", move.qty, "montagem de pacote", actorEmail);
    }
    pushMovement(state, kit.id, "montagem", kits, "montagem de pacote", actorEmail);
    refreshBalances(state);
    saveState(state);
    const updated = state.items.find((row) => row.id === kit.id)!;
    return { id: updated.id, name: updated.name, kind: "montagem", barcode: updated.barcode, balance: updated.balance };
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new StockError("not_ready");
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new StockError("not_ready");
}

function asNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new StockError("not_ready");
  return number;
}

function mapRpcError(error: { message?: string }): StockError {
  const message = error.message ?? "";
  if (message.includes("unknown_barcode")) return new StockError("unknown_barcode");
  if (message.includes("insufficient_stock")) return new StockError("insufficient_stock");
  if (message.includes("empty_kit")) return new StockError("empty_kit");
  if (message.includes("bad_component")) return new StockError("bad_component");
  if (message.includes("empty_name")) return new StockError("empty_name");
  if (message.includes("not_operator")) return new StockError("not_operator");
  if (message.includes("invalid_qty")) return new StockError("invalid_qty");
  if (/schema cache|PGRST202|stock_snapshot|stock_create_item/i.test(message)) return new StockError("not_ready");
  return new StockError("not_ready");
}

function parseHit(value: unknown): ScanHit {
  const row = asRecord(value);
  const kind = asString(row.kind);
  if (kind !== "entrada" && kind !== "saida" && kind !== "ajuste" && kind !== "montagem") {
    throw new StockError("not_ready");
  }
  return {
    id: asString(row.id),
    name: asString(row.name),
    kind,
    barcode: asString(row.barcode),
    balance: asNumber(row.balance),
  };
}

function parseSnapshot(value: unknown): Snapshot {
  const row = asRecord(value);
  const itemsRaw = Array.isArray(row.items) ? row.items : [];
  const movementsRaw = Array.isArray(row.movements) ? row.movements : [];
  const salesRaw = Array.isArray(row.sales) ? row.sales : [];
  const items: StockItem[] = itemsRaw.map((itemValue) => {
    const item = asRecord(itemValue);
    const kind = asString(item.kind);
    if (kind !== "simples" && kind !== "pacote") throw new StockError("not_ready");
    const componentsRaw = Array.isArray(item.components) ? item.components : [];
    return {
      id: asString(item.id),
      name: asString(item.name),
      kind,
      priceCents: asNumber(item.price_cents),
      minQty: asNumber(item.min_qty),
      barcode: asString(item.barcode),
      active: item.active !== false,
      balance: asNumber(item.balance),
      components: componentsRaw.map((componentValue) => {
        const component = asRecord(componentValue);
        return { componentId: asString(component.component_id), qty: asNumber(component.qty) };
      }),
    };
  });
  const movements: Movement[] = movementsRaw.map((movementValue) => {
    const movement = asRecord(movementValue);
    const kind = asString(movement.kind);
    if (kind !== "entrada" && kind !== "saida" && kind !== "ajuste" && kind !== "montagem") {
      throw new StockError("not_ready");
    }
    return {
      id: asString(movement.id),
      itemId: asString(movement.item_id),
      kind,
      qty: asNumber(movement.qty),
      note: typeof movement.note === "string" ? movement.note : "",
      actorEmail: typeof movement.actor_email === "string" ? movement.actor_email : "",
      createdAt: asString(movement.created_at),
    };
  });
  const sales: Sale[] = salesRaw.map((saleValue) => {
    const sale = asRecord(saleValue);
    return { itemId: asString(sale.item_id), qty: asNumber(sale.qty) };
  });
  return { items, movements, sales };
}

function clientOrThrow() {
  const client = getSupabase();
  if (!client) throw new StockError("not_ready");
  return client;
}

const remoteApi = {
  async load(): Promise<Snapshot> {
    const client = clientOrThrow();
    const { data, error } = await client.rpc("stock_snapshot");
    if (error) throw mapRpcError(error);
    return parseSnapshot(data);
  },
  async createItem(input: CreateInput): Promise<StockItem> {
    const client = clientOrThrow();
    const { data, error } = await client.rpc("stock_create_item", {
      p_name: input.name,
      p_kind: input.kind,
      p_price_cents: input.priceCents,
      p_min_qty: input.minQty,
      p_initial_qty: input.initialQty,
      p_components: input.components.map((component) => ({
        component_id: Number(component.componentId),
        qty: component.qty,
      })),
    });
    if (error) throw mapRpcError(error);
    const hit = asRecord(data);
    return {
      id: asString(hit.id),
      name: asString(hit.name),
      kind: input.kind,
      priceCents: input.priceCents,
      minQty: input.minQty,
      barcode: asString(hit.barcode),
      active: true,
      balance: asNumber(hit.balance),
      components: input.components,
    };
  },
  async scan(barcode: string, mode: ScanMode, qty: number): Promise<ScanHit> {
    const client = clientOrThrow();
    const { data, error } = await client.rpc("stock_apply_scan", {
      p_barcode: barcode,
      p_mode: mode,
      p_qty: qty,
    });
    if (error) throw mapRpcError(error);
    return parseHit(data);
  },
  async assemble(kitId: string, kits: number): Promise<ScanHit> {
    const client = clientOrThrow();
    const { data, error } = await client.rpc("stock_assemble", {
      p_kit_id: Number(kitId),
      p_kits: kits,
    });
    if (error) throw mapRpcError(error);
    return parseHit(data);
  },
};

export function usesMemoryStock(): boolean {
  return !hasCloudBackend;
}

export const stockApi = {
  load(): Promise<Snapshot> {
    return usesMemoryStock() ? memoryApi.load() : remoteApi.load();
  },
  createItem(input: CreateInput, actorEmail: string): Promise<StockItem> {
    return usesMemoryStock() ? memoryApi.createItem(input, actorEmail) : remoteApi.createItem(input);
  },
  scan(barcode: string, mode: ScanMode, qty: number, actorEmail: string): Promise<ScanHit> {
    return usesMemoryStock() ? memoryApi.scan(barcode, mode, qty, actorEmail) : remoteApi.scan(barcode, mode, qty);
  },
  assemble(kitId: string, kits: number, actorEmail: string): Promise<ScanHit> {
    return usesMemoryStock() ? memoryApi.assemble(kitId, kits, actorEmail) : remoteApi.assemble(kitId, kits);
  },
};

export function stockMessage(error: unknown): string {
  if (!(error instanceof StockError)) return "Não foi possível concluir.";
  if (error.code === "unknown_barcode") return "Código não cadastrado.";
  if (error.code === "insufficient_stock") return "Saldo insuficiente.";
  if (error.code === "empty_kit") return "O pacote precisa de uma unidade.";
  if (error.code === "bad_component") return "Escolha uma unidade já cadastrada.";
  if (error.code === "empty_name") return "Informe o nome.";
  if (error.code === "invalid_qty") return "Quantidade inválida.";
  if (error.code === "not_operator") return "Sessão sem permissão.";
  if (error.code === "not_ready") return "Falta aplicar supabase/erp_stock.sql no Supabase.";
  return "Não foi possível concluir.";
}
