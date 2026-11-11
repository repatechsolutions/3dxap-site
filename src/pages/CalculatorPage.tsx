import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Logo } from "../components/BrandMark";
import {
  defaultPiece,
  formatBRL,
  loadWorkshop,
  pricePrint,
  saveWorkshop,
  type ChannelFee,
  type PaintLevel,
  type PaintTier,
  type PieceInput,
  type WorkshopConfig,
} from "../lib/priceCalc";

const AUTH_KEY = "3dxap-admin-auth";

const PAINTS: { id: PaintLevel; label: string }[] = [
  { id: "none", label: "Sem pintura" },
  { id: "simple", label: "Simples" },
  { id: "medium", label: "Média" },
  { id: "complex", label: "Complexa" },
];

const inputClass =
  "mt-1 w-full rounded-xl border border-rosa/15 bg-cream px-3 py-2 text-[15px] font-normal text-ink outline-none focus:border-rosa";

export function CalculatorPage() {
  const navigate = useNavigate();
  const [piece, setPiece] = useState<PieceInput>(defaultPiece);
  const [workshop, setWorkshop] = useState<WorkshopConfig>(() => loadWorkshop(localStorage));
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  if (sessionStorage.getItem(AUTH_KEY) !== "1") {
    return <Navigate to="/admin" replace />;
  }

  const price = pricePrint(piece, workshop);

  function patchPiece<K extends keyof PieceInput>(key: K, value: PieceInput[K]) {
    setPiece((prev) => ({ ...prev, [key]: value }));
    setCopied(false);
  }

  function patchWorkshop(patch: Partial<WorkshopConfig>) {
    setWorkshop((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }

  function patchTier(level: "simple" | "medium" | "complex", patch: Partial<PaintTier>) {
    setWorkshop((prev) => ({
      ...prev,
      paint: { ...prev.paint, [level]: { ...prev.paint[level], ...patch } },
    }));
    setSaved(false);
  }

  function patchChannel(channel: keyof WorkshopConfig["channels"], patch: Partial<ChannelFee>) {
    setWorkshop((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: { ...prev.channels[channel], ...patch },
      },
    }));
    setSaved(false);
  }

  async function copyPrice() {
    try {
      await navigator.clipboard.writeText(formatBRL(price.price));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function saveConfig() {
    saveWorkshop(workshop, localStorage);
    setSaved(true);
  }

  function logout() {
    sessionStorage.removeItem(AUTH_KEY);
    navigate("/admin", { replace: true });
  }

  const markupLabel = price.markup.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const qtyLabel = price.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen pb-12">
      <header className="border-b border-rosa/10 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-[min(1100px,calc(100%-1.5rem))] flex-wrap items-center justify-between gap-3 py-3.5">
          <div className="flex items-center gap-3.5">
            <Logo height={46} />
            <div>
              <h1 className="font-display text-3xl font-semibold leading-none text-ink">Calculadora de preço</h1>
              <p className="mt-1 text-[13px] text-muted">Painel 3DXAP · nova página separada do orçamento</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/admin" className="admin-btn admin-btn-secondary">
              ← Voltar ao painel
            </Link>
            <button type="button" onClick={logout} className="admin-btn admin-btn-dark">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-[min(1100px,calc(100%-1.5rem))] pt-4">
        <p className="mb-3.5 rounded-2xl bg-sand/70 px-3.5 py-2.5 text-[13px] text-ink ring-1 ring-rosa/10">
          A energia entra só pela impressora (potência × horas). O aluguel começa em zero porque o trabalho é em
          casa, e a conta da casa não entra no preço. Esta página não lê nem grava o orçamento.
        </p>

        <div className="grid items-start gap-5 lg:grid-cols-[1.15fr_1fr]">
          <section className="order-2 rounded-3xl border border-rosa/10 bg-white p-5 shadow-sm lg:order-1">
            <h2 className="mb-2.5 font-display text-[22px] font-semibold text-ink">A peça</h2>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="block text-xs font-medium text-muted">
                Nome da peça
                <input
                  value={piece.name}
                  onChange={(event) => patchPiece("name", event.target.value)}
                  placeholder="Ex.: miniatura"
                  className={inputClass}
                />
              </label>
              <label className="block text-xs font-medium text-muted">
                Tipo de impressão
                <select
                  value={piece.process}
                  onChange={(event) => patchPiece("process", event.target.value === "resin" ? "resin" : "fdm")}
                  className={inputClass}
                >
                  <option value="fdm">Filamento (FDM)</option>
                  <option value="resin">Resina</option>
                </select>
              </label>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <NumField label="Tempo no fatiador (h)" value={piece.hours} step="0.1" onChange={(value) => patchPiece("hours", value)} />
              <NumField label="Peso (g)" value={piece.grams} step="1" onChange={(value) => patchPiece("grams", value)} />
              <NumField label="Quantidade" value={piece.quantity} step="1" onChange={(value) => patchPiece("quantity", value)} />
              <NumField label="Markup (×)" value={piece.markup} step="0.1" onChange={(value) => patchPiece("markup", value)} />
            </div>

            <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Pintura</p>
            <div className="flex flex-wrap gap-1.5">
              {PAINTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => patchPiece("paint", item.id)}
                  className={`rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-medium ${
                    piece.paint === item.id
                      ? "border-rosa bg-blush text-rosa-deep"
                      : "border-rosa/20 bg-white text-ink"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <details open className="mt-3 border-t border-dashed border-rosa/20 pt-2.5">
              <summary className="cursor-pointer text-sm font-semibold text-rosa-deep">
                Configurações da oficina (preenche uma vez, fica salvo)
              </summary>

              <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Custos fixos por mês (R$)</p>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                <NumField label="Aluguel × % usado" value={workshop.rent} onChange={(value) => patchWorkshop({ rent: value })} />
                <NumField label="Softwares" value={workshop.software} onChange={(value) => patchWorkshop({ software: value })} />
                <NumField label="Loja / e-commerce" value={workshop.ecommerce} onChange={(value) => patchWorkshop({ ecommerce: value })} />
                <NumField label="MEI" value={workshop.mei} onChange={(value) => patchWorkshop({ mei: value })} />
                <NumField label="Publicidade mínima" value={workshop.ads} onChange={(value) => patchWorkshop({ ads: value })} />
                <NumField label="Outros" value={workshop.other} onChange={(value) => patchWorkshop({ other: value })} />
                <NumField
                  label="Faturamento médio/mês"
                  value={workshop.monthlyRevenue}
                  onChange={(value) => patchWorkshop({ monthlyRevenue: value })}
                />
                <NumField
                  label="Falhas (%)"
                  value={workshop.failurePercent}
                  step="1"
                  onChange={(value) => patchWorkshop({ failurePercent: value })}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                Deixe o aluguel em zero. A oficina é em casa, então a conta da casa não é rateada.
              </p>
              {price.needsRevenue ? (
                <p className="mt-1 text-xs text-rosa-deep">
                  Há custo fixo e o faturamento está em zero, então esse custo ainda não entrou no preço.
                </p>
              ) : null}

              <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Impressoras (amortização)</p>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                <NumField
                  label="Valor pago (R$)"
                  value={workshop.printerPaid}
                  onChange={(value) => patchWorkshop({ printerPaid: value })}
                />
                <NumField
                  label="Vida útil (meses)"
                  value={workshop.printerLifeMonths}
                  step="1"
                  onChange={(value) => patchWorkshop({ printerLifeMonths: value })}
                />
                <NumField label="Potência A1 (W)" value={workshop.watts} step="1" onChange={(value) => patchWorkshop({ watts: value })} />
                <NumField
                  label="Energia (R$/kWh)"
                  value={workshop.energyBrlPerKwh}
                  onChange={(value) => patchWorkshop({ energyBrlPerKwh: value })}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                95 W é a média oficial da Bambu Lab A1 imprimindo PLA. Troque a potência se a peça for de outro
                material ou de outra impressora.
              </p>
              {price.needsLife ? (
                <p className="mt-1 text-xs text-rosa-deep">
                  Informe a vida útil em meses para a impressora entrar no custo. Com zero meses, ela não é amortizada.
                </p>
              ) : null}

              <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Material e envio</p>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                <NumField
                  label="Filamento/resina R$/kg (c/ frete)"
                  value={workshop.materialBrlPerKg}
                  onChange={(value) => patchWorkshop({ materialBrlPerKg: value })}
                />
                <NumField
                  label="Embalagem (R$)"
                  value={workshop.packagingBrl}
                  onChange={(value) => patchWorkshop({ packagingBrl: value })}
                />
                <NumField
                  label="Frete pago por você"
                  value={workshop.freightPaidBrl}
                  onChange={(value) => patchWorkshop({ freightPaidBrl: value })}
                />
                <NumField
                  label="Álcool por mesa (resina)"
                  value={workshop.alcoholPerBedBrl}
                  onChange={(value) => patchWorkshop({ alcoholPerBedBrl: value })}
                />
              </div>

              <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                Pintura (tinta R$ · horas) e custo da sua hora
              </p>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                <NumField label="Simples: tinta (R$)" value={workshop.paint.simple.inkBrl} onChange={(value) => patchTier("simple", { inkBrl: value })} />
                <NumField label="Simples: horas" value={workshop.paint.simple.hours} step="0.1" onChange={(value) => patchTier("simple", { hours: value })} />
                <NumField label="Média: tinta (R$)" value={workshop.paint.medium.inkBrl} onChange={(value) => patchTier("medium", { inkBrl: value })} />
                <NumField label="Média: horas" value={workshop.paint.medium.hours} step="0.1" onChange={(value) => patchTier("medium", { hours: value })} />
                <NumField label="Complexa: tinta (R$)" value={workshop.paint.complex.inkBrl} onChange={(value) => patchTier("complex", { inkBrl: value })} />
                <NumField label="Complexa: horas" value={workshop.paint.complex.hours} step="0.1" onChange={(value) => patchTier("complex", { hours: value })} />
                <NumField
                  label="Sua hora pintando (R$)"
                  value={workshop.paintHourBrl}
                  onChange={(value) => patchWorkshop({ paintHourBrl: value })}
                />
                <NumField label="Primer (R$)" value={workshop.primerBrl} onChange={(value) => patchWorkshop({ primerBrl: value })} />
                <NumField
                  label="Peças por frasco de primer"
                  value={workshop.primerPieces}
                  step="1"
                  onChange={(value) => patchWorkshop({ primerPieces: value })}
                />
                <NumField label="Verniz (R$)" value={workshop.varnishBrl} onChange={(value) => patchWorkshop({ varnishBrl: value })} />
                <NumField
                  label="Peças por frasco de verniz"
                  value={workshop.varnishPieces}
                  step="1"
                  onChange={(value) => patchWorkshop({ varnishPieces: value })}
                />
              </div>

              <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                Taxas para receber o mesmo líquido
              </p>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
                <NumField
                  label="Link Mercado Pago %"
                  value={workshop.channels.mercadoPago.percent}
                  step="0.1"
                  onChange={(value) => patchChannel("mercadoPago", { percent: value })}
                />
                <NumField
                  label="Mercado Pago R$ fixo"
                  value={workshop.channels.mercadoPago.fixedBrl}
                  onChange={(value) => patchChannel("mercadoPago", { fixedBrl: value })}
                />
                <NumField
                  label="Shopee %"
                  value={workshop.channels.shopee.percent}
                  step="0.1"
                  onChange={(value) => patchChannel("shopee", { percent: value })}
                />
                <NumField
                  label="Shopee R$ fixo"
                  value={workshop.channels.shopee.fixedBrl}
                  onChange={(value) => patchChannel("shopee", { fixedBrl: value })}
                />
                <NumField
                  label="Mercado Livre %"
                  value={workshop.channels.mercadoLivre.percent}
                  step="0.1"
                  onChange={(value) => patchChannel("mercadoLivre", { percent: value })}
                />
                <NumField
                  label="Mercado Livre R$ fixo"
                  value={workshop.channels.mercadoLivre.fixedBrl}
                  onChange={(value) => patchChannel("mercadoLivre", { fixedBrl: value })}
                />
              </div>

              <button type="button" onClick={saveConfig} className="admin-btn admin-btn-olive mt-4 w-full sm:w-auto">
                Salvar configuração
              </button>
              {saved ? <p className="mt-2 text-sm text-olive">Configuração salva neste navegador.</p> : null}
            </details>
          </section>

          <div className="order-1 flex flex-col gap-4 lg:order-2">
            <section className="rounded-3xl border border-rosa/25 bg-gradient-to-br from-blush to-white p-5 shadow-sm">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                Preço sugerido · venda direta (Pix/WhatsApp)
              </p>
              {piece.name.trim() ? <p className="mt-1 text-sm text-ink">{piece.name.trim()}</p> : null}
              <p className="font-display text-5xl font-bold leading-none text-rosa-deep sm:text-[52px]">{formatBRL(price.price)}</p>
              <p className="mt-2 inline-block rounded-full bg-olive-soft px-3 py-1 text-[13px] font-semibold text-[#3f5136]">
                Lucro {formatBRL(price.profit)} · custo {formatBRL(price.totalCost)}
              </p>
              <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <ChannelChip label="Link Mercado Pago" value={price.mercadoPago} />
                <ChannelChip label="Shopee" value={price.shopee} />
                <ChannelChip label="Mercado Livre" value={price.mercadoLivre} />
              </div>
              <p className="mt-2 text-[13px] text-muted">
                Nos marketplaces o preço já inclui a taxa, para você receber o mesmo valor da venda direta. Com taxa
                zero, o valor fica igual ao da venda direta. Confirme as taxas atuais em cada plataforma.
              </p>
              <div className="mt-3.5 flex flex-wrap gap-2">
                <button type="button" onClick={copyPrice} className="admin-btn admin-btn-primary">
                  {copied ? "Copiado" : "Copiar valor"}
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-rosa/10 bg-white p-5 shadow-sm">
              <h2 className="mb-2.5 font-display text-[22px] font-semibold text-ink">De onde vem o valor</h2>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {price.lines.map((line) => (
                    <tr key={line.label} className="border-b border-cream-deep">
                      <td className="py-1.5 pr-3">{line.label}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatBRL(line.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="pt-2.5 font-bold">Custo por peça</td>
                    <td className="pt-2.5 text-right font-bold tabular-nums">{formatBRL(price.unitCost)}</td>
                  </tr>
                  <tr>
                    <td className="pt-1">
                      × markup {markupLabel} × {qtyLabel} un.
                    </td>
                    <td className="pt-1 text-right font-bold tabular-nums">{formatBRL(price.price)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>
        </div>

        <p className="px-2 pt-6 text-center text-xs text-muted">
          Fórmula do vídeo "Precifique da maneira correta suas impressões 3D" (RM Maker3D). O orçamento do painel
          continua separado.
        </p>
      </main>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = "0.01",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => {
          const next = event.target.value === "" ? 0 : Number(event.target.value);
          onChange(Number.isFinite(next) ? next : 0);
        }}
        className={inputClass}
      />
    </label>
  );
}

function ChannelChip({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-2xl border border-rosa/10 bg-white px-2.5 py-2.5">
      <span className="block text-[11px] text-muted">{label}</span>
      <b className="mt-0.5 block text-lg tabular-nums">{value === null ? "Taxa inválida" : formatBRL(value)}</b>
    </div>
  );
}
