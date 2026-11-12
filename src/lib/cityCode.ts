const CODES: Record<string, string> = {
  "москва": "MSK", "санкт-петербург": "LED", "новосибирск": "NSK",
  "красноярск": "KJA", "екатеринбург": "SVX", "казань": "KZN",
  "нижний новгород": "GOJ", "самара": "KUF", "омск": "OMS",
  "челябинск": "CEK", "ростов-на-дону": "ROV", "уфа": "UFA",
  "пермь": "PEE", "волгоград": "VOG", "краснодар": "KRR",
  "воронеж": "VOZ", "томск": "TOF", "иркутск": "IKT",
  "владивосток": "VVO", "хабаровск": "KHV", "сочи": "AER",
  "калининград": "KGD", "барнаул": "BAX", "кемерово": "KEJ",
  "новокузнецк": "NOZ", "тюмень": "TJM", "саратов": "RTW",
  "якутск": "YKS", "мурманск": "MMK", "архангельск": "ARH",
  "минск": "MSQ", "мир": "WLD",
};

const norm = (s: string) =>
  s.normalize("NFKC").trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");

/** Авиационный код города; для неизвестных городов — полное название. */
export function cityCode(name: string | null | undefined): string {
  if (!name) return "";
  return CODES[norm(name)] ?? name.trim();
}
