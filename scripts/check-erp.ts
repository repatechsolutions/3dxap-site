import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { ean13CheckDigit, ean13FromBody, ean13Modules, isEan13 } from "../src/lib/erp/ean13.ts";
import { movementForScan, nextBarcode, planAssemble, situation } from "../src/lib/erp/ledger.ts";
import { StockError } from "../src/lib/erp/types.ts";

let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name} ${detail}`);
}

function expectThrow(name: string, fn: () => void, code: string) {
  try {
    fn();
    check(name, false, "não lançou");
  } catch (error) {
    check(name, error instanceof StockError && error.code === code, String(error));
  }
}

check("dígito 200000000001", ean13CheckDigit("200000000001") === 5);
check("código 2000000000015", ean13FromBody("200000000001") === "2000000000015" && isEan13("2000000000015"));
check("código de mercado 4006381333931", isEan13("4006381333931"));
check("dígito errado rejeitado", !isEan13("2000000000016"));
check("primeiro sequencial", nextBarcode(1) === "2000000000015");
check("segundo sequencial", nextBarcode(2) === "2000000000022");
check("barras têm 95 módulos", ean13Modules("2000000000015").length === 95);

function raster(code: string) {
  const bits = ean13Modules(code);
  const quiet = 20;
  const modulePx = 3;
  const barHeight = 90;
  const width = (bits.length + quiet * 2) * modulePx;
  const height = barHeight + 40;
  const pixels = new Int32Array(width * height);
  pixels.fill(0x00ffffff);
  for (let y = 16; y < 16 + barHeight; y += 1) {
    for (let i = 0; i < bits.length; i += 1) {
      if (bits[i] !== "1") continue;
      for (let m = 0; m < modulePx; m += 1) {
        const x = (quiet + i) * modulePx + m;
        pixels[y * width + x] = 0x00000000;
      }
    }
  }
  return { pixels, width, height };
}

function decode(code: string): string {
  const image = raster(code);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new MultiFormatReader();
  reader.setHints(hints);
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(image.pixels, image.width, image.height)));
  return reader.decode(bitmap).getText();
}

check("leitor lê 2000000000015", decode("2000000000015") === "2000000000015");
check("leitor lê 4006381333931", decode("4006381333931") === "4006381333931");
check("leitor lê o segundo sequencial", decode(nextBarcode(2)) === "2000000000022");

check("entrada 4", movementForScan("entrada", 4, 0).qty === 4);
check("saída 3 de saldo 10", movementForScan("saida", 3, 10).qty === -3);
expectThrow("saída maior que o saldo", () => movementForScan("saida", 11, 10), "insufficient_stock");
check("ajuste -2", movementForScan("ajuste", -2, 10).qty === -2);
expectThrow("ajuste abaixo de zero", () => movementForScan("ajuste", -11, 10), "insufficient_stock");
const assembled = planAssemble(2, [{ componentId: "a", qty: 3, balance: 10 }]);
check("montagem baixa 6", assembled[0]?.qty === -6);
expectThrow("montagem sem unidade", () => planAssemble(2, [{ componentId: "a", qty: 3, balance: 5 }]), "insufficient_stock");
check("situação zerado", situation(0, 8) === "zerado");
check("situação baixo", situation(4, 8) === "baixo");
check("situação no mínimo", situation(8, 8) === "minimo");
check("situação ok", situation(9, 8) === "ok");

const sql = readFileSync(new URL("../supabase/erp_stock.sql", import.meta.url), "utf8");
const db = new PGlite();
await db.exec(`
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select case
      when coalesce(current_setting('erp.email', true), '') = '' then null
      else '00000000-0000-0000-0000-000000000001'::uuid
    end
  $$;
  create or replace function auth.jwt() returns jsonb language sql stable as $$
    select jsonb_build_object('email', coalesce(current_setting('erp.email', true), ''))
  $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
`);
await db.exec(sql);
await db.query("select set_config('erp.email', 'pcristinapacheco@gmail.com', false)");

const digit = await db.query<{ digit: string }>("select public.ean13_check_digit('200000000001') as digit");
check("sql dígito igual ao ts", digit.rows[0]?.digit === "5");

const created = await db.query<{ item: { barcode: string; balance: number; name: string } }>(
  "select public.stock_create_item($1, 'simples', 1200, 2, 10, '[]'::jsonb) as item",
  ["Santinha N. Sra. Aparecida"],
);
const item = created.rows[0]?.item;
check("cadastro gera EAN-13 prefixo 2", Boolean(item && isEan13(item.barcode) && item.barcode.startsWith("2")));
check("quantidade inicial vira saldo 10", item?.balance === 10);

const saida = await db.query<{ hit: { balance: number; kind: string } }>(
  "select public.stock_apply_scan($1, 'saida', 3) as hit",
  [item?.barcode],
);
check("saída deixa saldo 7", saida.rows[0]?.hit.balance === 7 && saida.rows[0]?.hit.kind === "saida");

let blocked = false;
try {
  await db.query("select public.stock_apply_scan($1, 'saida', 20)", [item?.barcode]);
} catch (error) {
  blocked = String(error).includes("insufficient_stock");
}
check("sql recusa saída sem saldo", blocked);

const kit = await db.query<{ item: { id: number; barcode: string } }>(
  "select public.stock_create_item($1, 'pacote', 3000, 1, 0, $2::jsonb) as item",
  ["Kit 3 santinhas", JSON.stringify([{ component_id: 1, qty: 3 }])],
);
check("pacote tem outro código", kit.rows[0]?.item.barcode !== item?.barcode && isEan13(kit.rows[0]?.item.barcode ?? ""));

const built = await db.query<{ hit: { balance: number } }>(
  "select public.stock_assemble($1, 2) as hit",
  [kit.rows[0]?.item.id],
);
check("montar 2 pacotes", built.rows[0]?.hit.balance === 2);

const snap = await db.query<{ snap: { items: { name: string; balance: number; kind: string }[] } }>(
  "select public.stock_snapshot() as snap",
);
const rows = snap.rows[0]?.snap.items ?? [];
const unit = rows.find((row) => row.kind === "simples");
const pack = rows.find((row) => row.kind === "pacote");
check("saldo da unidade depois da montagem é 1", unit?.balance === 1);
check("saldo do pacote é 2", pack?.balance === 2);

await db.query("select set_config('erp.email', 'outra@example.com', false)");
let denied = false;
try {
  await db.query("select public.stock_snapshot()");
} catch (error) {
  denied = String(error).includes("not_operator");
}
check("e-mail fora da lista não lê o estoque", denied);

await db.close();

if (failed > 0) {
  console.error(`${failed} falha(s)`);
  process.exit(1);
}
console.log("erp ok");
