export const CONFIG_KEY = "3dxap-calc-config-v1";

/** Média de impressão em PLA da Bambu Lab A1: 95 W.
 * Fonte: Bambu Lab Wiki, "Printer and AMS power parameters", tabela A1 / A1 mini,
 * linha "PLA Average Power" (https://wiki.bambulab.com/en/general/power-consumption).
 * A ficha do produto (https://bambulab.com/en/a1/tech-specs) publica só o pico,
 * 1300 W a 220 V e 350 W a 110 V.
 */
export const BAMBU_A1_PLA_AVERAGE_WATTS = 95;

export const DEFAULT_ENERGY_BRL_PER_KWH = 0.96;

export const DEFAULT_PRINTER_LIFE_MONTHS = 36;

export const DEFAULT_MERCADO_PAGO_PERCENT = 4;

export type PrintProcess = "fdm" | "resin";

export type PaintLevel = "none" | "simple" | "medium" | "complex";

export type PieceInput = {
  name: string;
  process: PrintProcess;
  hours: number;
  grams: number;
  quantity: number;
  markup: number;
  paint: PaintLevel;
};

export type PaintTier = {
  inkBrl: number;
  hours: number;
};

export type ChannelFee = {
  percent: number;
  fixedBrl: number;
};

export type WorkshopConfig = {
  rent: number;
  software: number;
  ecommerce: number;
  mei: number;
  ads: number;
  other: number;
  monthlyRevenue: number;
  failurePercent: number;
  printerPaid: number;
  printerLifeMonths: number;
  watts: number;
  energyBrlPerKwh: number;
  materialBrlPerKg: number;
  packagingBrl: number;
  freightPaidBrl: number;
  alcoholPerBedBrl: number;
  paint: {
    simple: PaintTier;
    medium: PaintTier;
    complex: PaintTier;
  };
  paintHourBrl: number;
  primerBrl: number;
  primerPieces: number;
  varnishBrl: number;
  varnishPieces: number;
  channels: {
    mercadoPago: ChannelFee;
    shopee: ChannelFee;
    mercadoLivre: ChannelFee;
  };
};

export type MoneyLine = {
  label: string;
  amount: number;
};

export type PriceBreakdown = {
  material: number;
  energy: number;
  packFreightAlcohol: number;
  direct: number;
  monthlyFixed: number;
  fixedShare: number;
  indirect: number;
  failures: number;
  paint: number;
  unitCost: number;
  quantity: number;
  markup: number;
  totalCost: number;
  price: number;
  profit: number;
  mercadoPago: number | null;
  shopee: number | null;
  mercadoLivre: number | null;
  lines: MoneyLine[];
  needsRevenue: boolean;
  needsLife: boolean;
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const PAINT_LABEL: Record<PaintLevel, string> = {
  none: "Pintura (sem)",
  simple: "Pintura (simples)",
  medium: "Pintura (média)",
  complex: "Pintura (complexa)",
};

export function defaultPiece(): PieceInput {
  return {
    name: "",
    process: "fdm",
    hours: 0,
    grams: 0,
    quantity: 1,
    markup: 3,
    paint: "none",
  };
}

export function defaultWorkshop(): WorkshopConfig {
  return {
    rent: 0,
    software: 0,
    ecommerce: 0,
    mei: 0,
    ads: 0,
    other: 0,
    monthlyRevenue: 0,
    failurePercent: 10,
    printerPaid: 0,
    printerLifeMonths: DEFAULT_PRINTER_LIFE_MONTHS,
    watts: BAMBU_A1_PLA_AVERAGE_WATTS,
    energyBrlPerKwh: DEFAULT_ENERGY_BRL_PER_KWH,
    materialBrlPerKg: 0,
    packagingBrl: 0,
    freightPaidBrl: 0,
    alcoholPerBedBrl: 0,
    paint: {
      simple: { inkBrl: 0, hours: 0 },
      medium: { inkBrl: 0, hours: 0 },
      complex: { inkBrl: 0, hours: 0 },
    },
    paintHourBrl: 0,
    primerBrl: 0,
    primerPieces: 0,
    varnishBrl: 0,
    varnishPieces: 0,
    channels: {
      mercadoPago: { percent: DEFAULT_MERCADO_PAGO_PERCENT, fixedBrl: 0 },
      shopee: { percent: 0, fixedBrl: 0 },
      mercadoLivre: { percent: 0, fixedBrl: 0 },
    },
  };
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function pricePrint(piece: PieceInput, workshop: WorkshopConfig): PriceBreakdown {
  const hours = nonNeg(piece.hours);
  const grams = nonNeg(piece.grams);
  const quantity = nonNeg(piece.quantity);
  const markup = nonNeg(piece.markup);
  const watts = nonNeg(workshop.watts);
  const kwh = nonNeg(workshop.energyBrlPerKwh);
  const materialPerKg = nonNeg(workshop.materialBrlPerKg);

  const material = (materialPerKg / 1000) * grams;
  const energy = (watts / 1000) * hours * kwh;
  const alcohol = piece.process === "resin" ? nonNeg(workshop.alcoholPerBedBrl) : 0;
  const packFreightAlcohol = nonNeg(workshop.packagingBrl) + nonNeg(workshop.freightPaidBrl) + alcohol;
  const direct = material + energy + packFreightAlcohol;

  const monthlyFixed = monthlyOverhead(workshop);
  const revenue = nonNeg(workshop.monthlyRevenue);
  const fixedShare = revenue > 0 ? monthlyFixed / revenue : 0;
  const indirect = direct * fixedShare;
  const failurePercent = nonNeg(workshop.failurePercent);
  const failures = (direct + indirect) * (failurePercent / 100);
  const paint = paintCost(piece.paint, workshop);
  const unitCost = direct + indirect + failures + paint;
  const totalCost = unitCost * quantity;
  const price = totalCost * markup;
  const profit = price - totalCost;

  const shareLabel = (fixedShare * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const failureLabel = failurePercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return {
    material,
    energy,
    packFreightAlcohol,
    direct,
    monthlyFixed,
    fixedShare,
    indirect,
    failures,
    paint,
    unitCost,
    quantity,
    markup,
    totalCost,
    price,
    profit,
    mercadoPago: shelfPriceForNet(price, workshop.channels.mercadoPago, quantity),
    shopee: shelfPriceForNet(price, workshop.channels.shopee, quantity),
    mercadoLivre: shelfPriceForNet(price, workshop.channels.mercadoLivre, quantity),
    needsRevenue: monthlyFixed > 0 && revenue <= 0,
    needsLife: nonNeg(workshop.printerPaid) > 0 && workshop.printerLifeMonths <= 0,
    lines: [
      { label: `Material (${formatQty(grams)} g × ${formatBRL(materialPerKg)}/kg)`, amount: material },
      {
        label: `Energia (${formatQty(watts)} W × ${formatQty(hours)} h × ${formatBRL(kwh)})`,
        amount: energy,
      },
      {
        label: alcohol > 0 ? "Embalagem + frete + álcool" : "Embalagem + frete",
        amount: packFreightAlcohol,
      },
      {
        label: `Custo fixo rateado (${shareLabel}% de ${formatBRL(monthlyFixed)}/mês)`,
        amount: indirect,
      },
      { label: `Reserva para falhas (${failureLabel}%)`, amount: failures },
      { label: PAINT_LABEL[piece.paint], amount: paint },
    ],
  };
}

export function loadWorkshop(storage: StorageLike): WorkshopConfig {
  try {
    const raw = storage.getItem(CONFIG_KEY);
    if (!raw) return defaultWorkshop();
    return parseWorkshop(jsonUnknown(raw));
  } catch {
    return defaultWorkshop();
  }
}

export function saveWorkshop(config: WorkshopConfig, storage: StorageLike): void {
  storage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function parseWorkshop(value: unknown): WorkshopConfig {
  const base = defaultWorkshop();
  if (!isRecord(value)) return base;
  const paint = isRecord(value.paint) ? value.paint : {};
  const channels = isRecord(value.channels) ? value.channels : {};
  return {
    rent: num(value.rent, base.rent),
    software: num(value.software, base.software),
    ecommerce: num(value.ecommerce, base.ecommerce),
    mei: num(value.mei, base.mei),
    ads: num(value.ads, base.ads),
    other: num(value.other, base.other),
    monthlyRevenue: num(value.monthlyRevenue, base.monthlyRevenue),
    failurePercent: num(value.failurePercent, base.failurePercent),
    printerPaid: num(value.printerPaid, base.printerPaid),
    printerLifeMonths: num(value.printerLifeMonths, base.printerLifeMonths),
    watts: num(value.watts, base.watts),
    energyBrlPerKwh: num(value.energyBrlPerKwh, base.energyBrlPerKwh),
    materialBrlPerKg: num(value.materialBrlPerKg, base.materialBrlPerKg),
    packagingBrl: num(value.packagingBrl, base.packagingBrl),
    freightPaidBrl: num(value.freightPaidBrl, base.freightPaidBrl),
    alcoholPerBedBrl: num(value.alcoholPerBedBrl, base.alcoholPerBedBrl),
    paint: {
      simple: readTier(paint.simple, base.paint.simple),
      medium: readTier(paint.medium, base.paint.medium),
      complex: readTier(paint.complex, base.paint.complex),
    },
    paintHourBrl: num(value.paintHourBrl, base.paintHourBrl),
    primerBrl: num(value.primerBrl, base.primerBrl),
    primerPieces: num(value.primerPieces, base.primerPieces),
    varnishBrl: num(value.varnishBrl, base.varnishBrl),
    varnishPieces: num(value.varnishPieces, base.varnishPieces),
    channels: {
      mercadoPago: readFee(channels.mercadoPago, base.channels.mercadoPago),
      shopee: readFee(channels.shopee, base.channels.shopee),
      mercadoLivre: readFee(channels.mercadoLivre, base.channels.mercadoLivre),
    },
  };
}

function monthlyOverhead(workshop: WorkshopConfig): number {
  return (
    nonNeg(workshop.rent) +
    nonNeg(workshop.software) +
    nonNeg(workshop.ecommerce) +
    nonNeg(workshop.mei) +
    nonNeg(workshop.ads) +
    nonNeg(workshop.other) +
    amortization(workshop.printerPaid, workshop.printerLifeMonths)
  );
}

function amortization(paid: number, lifeMonths: number): number {
  if (lifeMonths <= 0) return 0;
  return nonNeg(paid) / lifeMonths;
}

function paintCost(level: PaintLevel, workshop: WorkshopConfig): number {
  if (level === "none") return 0;
  const tier = workshop.paint[level];
  return (
    nonNeg(tier.inkBrl) +
    perPiece(workshop.primerBrl, workshop.primerPieces) +
    perPiece(workshop.varnishBrl, workshop.varnishPieces) +
    nonNeg(tier.hours) * nonNeg(workshop.paintHourBrl)
  );
}

function perPiece(bottleBrl: number, pieces: number): number {
  if (pieces <= 0) return 0;
  return nonNeg(bottleBrl) / pieces;
}

function shelfPriceForNet(net: number, fee: ChannelFee, quantity: number): number | null {
  const percent = nonNeg(fee.percent);
  if (percent >= 100) return null;
  const fixed = nonNeg(fee.fixedBrl) * quantity;
  return (net + fixed) / (1 - percent / 100);
}

function nonNeg(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatQty(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function jsonUnknown(raw: string): unknown {
  const value: unknown = JSON.parse(raw);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readTier(value: unknown, fallback: PaintTier): PaintTier {
  if (!isRecord(value)) return fallback;
  return {
    inkBrl: num(value.inkBrl, fallback.inkBrl),
    hours: num(value.hours, fallback.hours),
  };
}

function readFee(value: unknown, fallback: ChannelFee): ChannelFee {
  if (!isRecord(value)) return fallback;
  return {
    percent: num(value.percent, fallback.percent),
    fixedBrl: num(value.fixedBrl, fallback.fixedBrl),
  };
}
