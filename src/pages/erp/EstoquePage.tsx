import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ean13Svg } from "@/lib/erp/ean13";
import { bestSeller, isLow, situation } from "@/lib/erp/ledger";
import { LABEL_SIZES, labelSize, printLabels, type LabelSizeId } from "@/lib/erp/labels";
import { formatBrl } from "@/lib/erp/money";
import { stockApi, stockMessage } from "@/lib/erp/stock-api";
import type { CreateInput, ErpUser, ScanMode, Snapshot, StockItem } from "@/lib/erp/types";
import { ProductDialog } from "./ProductDialog";

const MODES: { id: ScanMode; label: string }[] = [
  { id: "entrada", label: "Entrada" },
  { id: "saida", label: "Saída" },
  { id: "ajuste", label: "Ajuste" },
];

const KIND_LABEL = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
  montagem: "Montagem",
} as const;

type Feedback =
  | { ok: true; title: string; detail: string }
  | { ok: false; title: string; detail: string; suggest: boolean };

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function beep(ok: boolean) {
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = ok ? 880 : 196;
  gain.gain.value = 0.04;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
  osc.onended = () => void ctx.close();
}

function situationBadge(item: StockItem) {
  const state = situation(item.balance, item.minQty);
  if (state === "ok") return <Badge variant="secondary">Ok</Badge>;
  if (state === "zerado") return <Badge variant="destructive">Zerado</Badge>;
  if (state === "minimo") return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">No mínimo</Badge>;
  return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Baixo</Badge>;
}

export function EstoquePage({
  user,
  createOpen,
  onCreateOpenChange,
}: {
  user: ErpUser;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const [params, setParams] = useSearchParams();
  const aba = params.get("aba") === "bipar" || params.get("aba") === "etiquetas" ? params.get("aba")! : "produtos";
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<ScanMode>("saida");
  const [qty, setQty] = useState("1");
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sizeId, setSizeId] = useState<LabelSizeId>("100x150");
  const [copies, setCopies] = useState("1");
  const [assembleId, setAssembleId] = useState<string | null>(null);
  const [kits, setKits] = useState("1");
  const scanRef = useRef<HTMLInputElement>(null);

  async function reload() {
    const next = await stockApi.load();
    setSnapshot(next);
    setSelectedId((current) => current ?? next.items[0]?.id ?? null);
    return next;
  }

  useEffect(() => {
    let stop = false;
    void stockApi.load().then((next) => {
      if (stop) return;
      setSnapshot(next);
      setSelectedId(next.items[0]?.id ?? null);
    }).catch((err: unknown) => {
      if (!stop) setError(stockMessage(err));
    });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (createOpen || assembleId) return;
    const node = scanRef.current;
    const focus = () => {
      const active = document.activeElement;
      if (!node || active === node) return;
      if (active?.closest("[role='dialog']")) return;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;
      node.focus();
    };
    focus();
    const onBlur = () => window.setTimeout(focus, 40);
    node?.addEventListener("blur", onBlur);
    return () => node?.removeEventListener("blur", onBlur);
  }, [createOpen, assembleId, aba]);

  const items = snapshot?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const low = items.filter((item) => isLow(item.balance, item.minQty));
  const units = items.filter((item) => item.kind === "simples");
  const packs = items.filter((item) => item.kind === "pacote");
  const unitBalance = units.reduce((sum, item) => sum + item.balance, 0);
  const packBalance = packs.reduce((sum, item) => sum + item.balance, 0);
  const top = useMemo(() => bestSeller(items, snapshot?.sales ?? []), [items, snapshot?.sales]);
  const size = labelSize(sizeId);
  const assembling = items.find((item) => item.id === assembleId) ?? null;

  async function onScan(raw: string) {
    const barcode = raw.trim();
    if (!barcode) return;
    const amount = Number(qty);
    if (!Number.isInteger(amount) || amount === 0 || (mode !== "ajuste" && amount < 0)) {
      setFeedback({ ok: false, title: "Quantidade inválida", detail: "Use um inteiro. No ajuste, pode ser negativo.", suggest: false });
      beep(false);
      return;
    }
    try {
      const hit = await stockApi.scan(barcode, mode, amount, user.email);
      await reload();
      setSelectedId(hit.id);
      setCode("");
      const title = `${KIND_LABEL[hit.kind]} registrada`;
      setFeedback({ ok: true, title, detail: `${hit.name} · saldo ${hit.balance}` });
      beep(true);
    } catch (err) {
      const message = stockMessage(err);
      const unknown = message === "Código não cadastrado.";
      setFeedback({ ok: false, title: message, detail: barcode, suggest: unknown });
      beep(false);
      setCode("");
      scanRef.current?.focus();
    }
  }

  async function onCreate(input: CreateInput) {
    const created = await stockApi.createItem(input, user.email);
    await reload();
    setSelectedId(created.id);
    toast.success(`${created.name} cadastrado`, { description: `Código ${created.barcode}` });
  }

  async function onAssemble() {
    if (!assembling) return;
    const count = Number(kits);
    try {
      const hit = await stockApi.assemble(assembling.id, count, user.email);
      await reload();
      setAssembleId(null);
      setFeedback({ ok: true, title: "Pacote montado", detail: `${hit.name} · saldo ${hit.balance}` });
      toast.success("Pacote montado", { description: `${hit.name} · saldo ${hit.balance}` });
      beep(true);
    } catch (err) {
      toast.error(stockMessage(err));
      beep(false);
    }
  }

  function onPrint() {
    if (!selected) return;
    const count = Number(copies);
    if (!Number.isInteger(count) || count < 1) {
      toast.error("Informe a quantidade de cópias.");
      return;
    }
    try {
      printLabels({ name: selected.name, barcode: selected.barcode, size, copies: count });
    } catch {
      toast.error("O navegador bloqueou a janela de impressão.");
    }
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!snapshot) {
    return <p className="text-sm text-muted-foreground">Carregando estoque…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Itens cadastrados</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{items.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{countLabel(units.length, "unidade", "unidades")} · {countLabel(packs.length, "pacote", "pacotes")}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saldo em unidades</CardDescription>
            <CardTitle className="text-3xl tabular-nums" data-testid="kpi-units">{unitBalance}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">e {countLabel(packBalance, "pacote pronto", "pacotes prontos")}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Estoque baixo</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{low.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {low.length === 0 ? "Nenhum item no limite" : low.map((item) => item.name).slice(0, 2).join(" e ")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mais vendido no mês</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{top?.units ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{top?.name ?? "Sem saídas neste mês"}</CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-4 md:grid-cols-[auto_minmax(0,1fr)_240px] md:items-end">
          <div className="grid gap-1.5">
            <Label>Modo</Label>
            <div className="flex gap-1">
              {MODES.map((item) => (
                <Button key={item.id} type="button" size="sm" variant={mode === item.id ? "default" : "outline"} onClick={() => setMode(item.id)}>
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <form
            className="grid gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void onScan(code);
            }}
          >
            <Label htmlFor="scan">Bipar código de barras</Label>
            <div className="flex gap-2">
              <Input
                id="scan"
                data-testid="scan-input"
                ref={scanRef}
                value={code}
                autoComplete="off"
                placeholder="Campo sempre focado. Bipe ou digite e aperte Enter"
                onChange={(event) => setCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  void onScan(event.currentTarget.value);
                }}
              />
              <Input
                aria-label="Quantidade"
                className="w-20"
                inputMode="numeric"
                value={qty}
                onChange={(event) => setQty(event.target.value)}
              />
            </div>
          </form>
          <div className={`rounded-lg px-3 py-2 text-sm ${feedback?.ok === false ? "bg-destructive/10 text-destructive" : "bg-erp-muted"}`}>
            <div className="font-medium">{feedback?.title ?? "Aguardando bipe"}</div>
            <div className="text-xs opacity-80">{feedback?.detail ?? "O leitor USB termina com Enter."}</div>
            {feedback?.ok === false && feedback.suggest ? (
              <Button type="button" size="sm" className="mt-2" variant="outline" onClick={() => onCreateOpenChange(true)}>
                Cadastrar produto
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Tabs
        className="flex-col"
        value={aba}
        onValueChange={(value) => {
          if (value === "produtos" || value === "bipar" || value === "etiquetas") setParams(value === "produtos" ? {} : { aba: value });
        }}
      >
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="bipar">Bipar</TabsTrigger>
          <TabsTrigger value="etiquetas">Etiquetas</TabsTrigger>
          <TabsTrigger value="promocoes" disabled>Promoções <span className="text-[10px] text-muted-foreground">Fase 2</span></TabsTrigger>
          <TabsTrigger value="rifas" disabled>Rifas <span className="text-[10px] text-muted-foreground">Fase 2</span></TabsTrigger>
        </TabsList>
        <TabsContent value="produtos" className="pt-4">
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <ItemTable items={items} onSelect={setSelectedId} onAssemble={setAssembleId} />
            <LabelCard item={selected} sizeId={sizeId} copies={copies} onSize={setSizeId} onCopies={setCopies} onPrint={onPrint} />
          </div>
        </TabsContent>
        <TabsContent value="bipar" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Últimos movimentos</CardTitle>
              <CardDescription>Entrada, saída, ajuste e montagem de pacote.</CardDescription>
            </CardHeader>
            <CardContent>
              <MovementTable items={items} movements={snapshot.movements} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="etiquetas" className="pt-4">
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <ItemTable items={items} onSelect={setSelectedId} onAssemble={setAssembleId} />
            <LabelCard item={selected} sizeId={sizeId} copies={copies} onSize={setSizeId} onCopies={setCopies} onPrint={onPrint} />
          </div>
        </TabsContent>
      </Tabs>

      <ProductDialog open={createOpen} onOpenChange={onCreateOpenChange} items={items} onCreate={onCreate} />

      <Dialog open={Boolean(assembling)} onOpenChange={(open) => { if (!open) setAssembleId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Montar pacote</DialogTitle>
            <DialogDescription>
              {assembling ? `${assembling.name}. A montagem baixa as unidades e soma os pacotes.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="kits">Quantidade de pacotes</Label>
            <Input id="kits" inputMode="numeric" value={kits} onChange={(event) => setKits(event.target.value)} />
            <ul className="text-sm text-muted-foreground">
              {assembling?.components.map((component) => {
                const unit = items.find((item) => item.id === component.componentId);
                const count = Number(kits);
                const need = Number.isInteger(count) && count > 0 ? component.qty * count : 0;
                return <li key={component.componentId}>{need} × {unit?.name ?? "Unidade"} (saldo {unit?.balance ?? 0})</li>;
              })}
            </ul>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => void onAssemble()}>Montar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemTable({
  items,
  onSelect,
  onAssemble,
}: {
  items: StockItem[];
  onSelect: (id: string) => void;
  onAssemble: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Saldo por item</CardTitle>
        <CardDescription>O saldo é a soma das movimentações.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum produto ainda. Cadastre o primeiro para gerar o código.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} data-testid={`row-${item.barcode}`}>
                  <TableCell className="font-medium">
                    {item.name}
                    {item.kind === "pacote" ? <Badge variant="outline" className="ml-2">Pacote</Badge> : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{item.barcode}</TableCell>
                  <TableCell className="text-right tabular-nums" data-testid={`balance-${item.barcode}`}>{item.balance}</TableCell>
                  <TableCell>{situationBadge(item)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBrl(item.priceCents)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {item.kind === "pacote" ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => onAssemble(item.id)}>Montar</Button>
                      ) : null}
                      <Button type="button" size="sm" variant="outline" onClick={() => onSelect(item.id)}>Etiqueta</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function MovementTable({ items, movements }: { items: StockItem[]; movements: Snapshot["movements"] }) {
  if (movements.length === 0) return <p className="text-sm text-muted-foreground">Nenhum movimento ainda.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Quando</TableHead>
          <TableHead>Item</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead className="text-right">Qtd</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {movements.map((movement) => (
          <TableRow key={movement.id}>
            <TableCell className="text-xs text-muted-foreground">{new Date(movement.createdAt).toLocaleString("pt-BR")}</TableCell>
            <TableCell>{items.find((item) => item.id === movement.itemId)?.name ?? movement.itemId}</TableCell>
            <TableCell>{KIND_LABEL[movement.kind]}</TableCell>
            <TableCell className="text-right tabular-nums">{movement.qty}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LabelCard({
  item,
  sizeId,
  copies,
  onSize,
  onCopies,
  onPrint,
}: {
  item: StockItem | null;
  sizeId: LabelSizeId;
  copies: string;
  onSize: (id: LabelSizeId) => void;
  onCopies: (value: string) => void;
  onPrint: () => void;
}) {
  const size = labelSize(sizeId);
  const count = Number(copies);
  const printCount = Number.isInteger(count) && count > 0 ? count : 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prévia da etiqueta</CardTitle>
        <CardDescription>{size.caption}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex justify-center rounded-lg border border-dashed p-3" data-testid="label-preview">
          {item ? (
            <div className="flex w-full max-w-[220px] flex-col items-center gap-1 bg-white p-2">
              <div className="text-[11px] font-semibold tracking-[0.08em]">3DXAP</div>
              <div className="text-center text-sm font-semibold">{item.name}</div>
              <div data-testid="barcode-svg" dangerouslySetInnerHTML={{ __html: ean13Svg(item.barcode) }} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Cadastre um produto para ver a etiqueta.</p>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-1">
          {LABEL_SIZES.map((option) => (
            <Button key={option.id} type="button" size="sm" variant={option.id === sizeId ? "default" : "outline"} onClick={() => onSize(option.id)}>
              {option.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="copias">Cópias</Label>
          <Input id="copias" inputMode="numeric" value={copies} onChange={(event) => onCopies(event.target.value)} />
        </div>
        <Button type="button" disabled={!item} onClick={onPrint}>Imprimir {printCount} etiqueta{printCount === 1 ? "" : "s"}</Button>
      </CardContent>
    </Card>
  );
}
