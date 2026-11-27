import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseBrlToCents } from "@/lib/erp/money";
import { stockMessage } from "@/lib/erp/stock-api";
import type { CreateInput, StockItem } from "@/lib/erp/types";

export function ProductDialog({
  open,
  onOpenChange,
  items,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: StockItem[];
  onCreate: (input: CreateInput) => Promise<void>;
}) {
  const units = items.filter((item) => item.kind === "simples");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [minQty, setMinQty] = useState("0");
  const [initialQty, setInitialQty] = useState("0");
  const [kind, setKind] = useState<"simples" | "pacote">("simples");
  const [pack, setPack] = useState<3 | 5>(3);
  const [componentId, setComponentId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setName("");
      setPrice("");
      setMinQty("0");
      setInitialQty("0");
      setKind("simples");
      setPack(3);
      setComponentId(items.find((item) => item.kind === "simples")?.id ?? "");
      setError("");
    }
    wasOpen.current = open;
  }, [open, items]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const priceCents = parseBrlToCents(price);
    const min = Number(minQty);
    const initial = Number(initialQty);
    if (priceCents === null || !Number.isInteger(min) || min < 0 || !Number.isInteger(initial) || initial < 0) {
      setError("Preço ou quantidade inválidos.");
      return;
    }
    const input: CreateInput = {
      name,
      kind,
      priceCents,
      minQty: min,
      initialQty: initial,
      components: kind === "pacote" ? [{ componentId, qty: pack }] : [],
    };
    setBusy(true);
    setError("");
    try {
      await onCreate(input);
      onOpenChange(false);
    } catch (err) {
      setError(stockMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo produto</DialogTitle>
          <DialogDescription>
            O código EAN-13 nasce aqui, com prefixo 2. A quantidade inicial entra como movimentação de entrada.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="preco">Preço</Label>
              <Input id="preco" inputMode="decimal" placeholder="12,00" value={price} onChange={(event) => setPrice(event.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="minimo">Estoque mínimo</Label>
              <Input id="minimo" inputMode="numeric" value={minQty} onChange={(event) => setMinQty(event.target.value)} required />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inicial">Quantidade inicial</Label>
            <Input id="inicial" inputMode="numeric" value={initialQty} onChange={(event) => setInitialQty(event.target.value)} required />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={kind === "simples" ? "default" : "outline"} onClick={() => setKind("simples")}>
              Unidade
            </Button>
            <Button type="button" size="sm" variant={kind === "pacote" ? "default" : "outline"} onClick={() => setKind("pacote")}>
              Pacote
            </Button>
          </div>
          {kind === "pacote" ? (
            <div className="grid gap-3">
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={pack === 3 ? "default" : "outline"} onClick={() => setPack(3)}>3 unidades</Button>
                <Button type="button" size="sm" variant={pack === 5 ? "default" : "outline"} onClick={() => setPack(5)}>5 unidades</Button>
              </div>
              {units.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cadastre uma unidade antes de montar o pacote.</p>
              ) : (
                <Select value={componentId} onValueChange={(value) => setComponentId(value ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Unidade do pacote" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={busy || (kind === "pacote" && units.length === 0)}>Cadastrar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
