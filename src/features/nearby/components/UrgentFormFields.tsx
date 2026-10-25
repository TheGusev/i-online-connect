import { Tag, Search, Handshake, Car, Gift } from "lucide-react";
import { Button, Input } from "@/components/ds";
import { suggestPrices, URGENT_TYPES, type UrgentType } from "../urgent";
import { moneyInput, priceSteps, urgentLabels } from "../urgent-ui";
import { formatPrice } from "../labels";

const icons = { sell: Tag, buy: Search, help: Handshake, ride: Car, giveaway: Gift };
export interface UrgentFields {
  market: string; start: string; floor: string;
  from: string; to: string; departure: string; seats: string; pickup: string;
}
export const emptyUrgentFields: UrgentFields = { market: "", start: "", floor: "", from: "", to: "", departure: "", seats: "1", pickup: "" };
export function UrgentTypePicker({ value, onChange }: { value: UrgentType; onChange: (value: UrgentType) => void }) {
  return <fieldset><legend className="mb-3 text-sm font-semibold">Что нужно срочно</legend><div className="flex flex-col gap-2">
    {URGENT_TYPES.map(type => { const Icon = icons[type]; return <Button key={type} type="button" size="md" fullWidth variant={value === type ? "primary" : "secondary"} aria-pressed={value === type} onClick={() => onChange(type)} className="tracking-normal"><Icon aria-hidden="true" />{urgentLabels[type]}</Button>; })}
  </div></fieldset>;
}
export function UrgentFormFields({ type, fields, onChange, minutes }: { type: UrgentType; fields: UrgentFields; onChange: (fields: UrgentFields) => void; minutes: number }) {
  const set = (key: keyof UrgentFields, value: string) => onChange({ ...fields, [key]: value });
  const start = moneyInput(fields.start), floor = moneyInput(fields.floor);
  if (type === "sell") return <div className="space-y-4">
    <Input label="Сколько стоит такое на рынке (необязательно), ₽" value={fields.market} inputMode="decimal" onChange={e => {
      const market = moneyInput(e.target.value);
      const suggestion = market === null ? null : suggestPrices(market);
      onChange({ ...fields, market: e.target.value, ...(suggestion ? { start: String(suggestion.start / 100), floor: String(suggestion.floor / 100) } : {}) });
    }} />
    <Input label="Стартовая цена, ₽" value={fields.start} inputMode="decimal" required onChange={e => set("start", e.target.value)} />
    <Input label="Нижняя цена (её увидите только вы), ₽" value={fields.floor} inputMode="decimal" required onChange={e => set("floor", e.target.value)} hint="Старт не выше 1,5 от нижней. Нижняя цена — от 100 ₽" />
    {minutes === 15 && <p className="text-sm text-primary">Для 15 минут нужен покупатель рядом</p>}
    {start !== null && floor !== null && floor <= start && <section aria-label="Ступени снижения цены"><h3 className="mb-2 text-sm font-semibold">Ваш график цены</h3><ul className="divide-y divide-border text-sm">{priceSteps(start, floor, minutes).map((step, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-2"><span className="text-muted-foreground">через {step.afterMinutes} мин</span><span>{formatPrice(step.priceMinor)}</span></li>)}</ul></section>}
  </div>;
  if (type === "ride") return <div className="space-y-4">
    <Input label="Откуда" value={fields.from} required maxLength={120} onChange={e => set("from", e.target.value)} />
    <Input label="Куда" value={fields.to} required maxLength={120} onChange={e => set("to", e.target.value)} />
    <Input label="Время выезда" type="datetime-local" value={fields.departure} required onChange={e => set("departure", e.target.value)} />
    <Input label="Число мест" type="number" min={1} max={99} value={fields.seats} required onChange={e => set("seats", e.target.value)} />
  </div>;
  if (type === "giveaway") return <Input label="Время забора" type="datetime-local" value={fields.pickup} required onChange={e => set("pickup", e.target.value)} />;
  return null;
}