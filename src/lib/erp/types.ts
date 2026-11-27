export type ItemKind = "simples" | "pacote";
export type MovementKind = "entrada" | "saida" | "ajuste" | "montagem";
export type ScanMode = "entrada" | "saida" | "ajuste";

export type DomainError =
  | "unknown_barcode"
  | "insufficient_stock"
  | "invalid_qty"
  | "empty_name"
  | "empty_kit"
  | "bad_component"
  | "not_operator"
  | "not_ready";

export class StockError extends Error {
  readonly code: DomainError;

  constructor(code: DomainError) {
    super(code);
    this.code = code;
  }
}

export type Item = {
  id: string;
  name: string;
  kind: ItemKind;
  priceCents: number;
  minQty: number;
  barcode: string;
  active: boolean;
};

export type KitComponent = {
  componentId: string;
  qty: number;
};

export type StockItem = Item & {
  balance: number;
  components: KitComponent[];
};

export type Movement = {
  id: string;
  itemId: string;
  kind: MovementKind;
  qty: number;
  note: string;
  actorEmail: string;
  createdAt: string;
};

export type Sale = {
  itemId: string;
  qty: number;
};

export type Snapshot = {
  items: StockItem[];
  movements: Movement[];
  sales: Sale[];
};

export type CreateInput = {
  name: string;
  kind: ItemKind;
  priceCents: number;
  minQty: number;
  initialQty: number;
  components: KitComponent[];
};

export type ScanHit = {
  id: string;
  name: string;
  kind: MovementKind;
  barcode: string;
  balance: number;
};

export type ErpUser = {
  email: string;
  name: string;
};
