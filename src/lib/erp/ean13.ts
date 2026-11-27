const L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];

const G = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
];

const R = L.map((pattern) =>
  [...pattern].map((bit) => (bit === "0" ? "1" : "0")).join(""),
);

const PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

export function ean13CheckDigit(body12: string): number {
  if (!/^\d{12}$/.test(body12)) {
    throw new Error("ean13 body");
  }
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const digit = body12.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function ean13FromBody(body12: string): string {
  return body12 + String(ean13CheckDigit(body12));
}

export function isEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export function ean13Modules(code: string): string {
  if (!isEan13(code)) throw new Error("ean13");
  const digits = [...code].map((char) => Number(char));
  const parity = PARITY[digits[0]];
  let bits = "101";
  for (let i = 0; i < 6; i += 1) {
    const table = parity[i] === "L" ? L : G;
    bits += table[digits[i + 1]];
  }
  bits += "01010";
  for (let i = 0; i < 6; i += 1) {
    bits += R[digits[i + 7]];
  }
  bits += "101";
  return bits;
}

export function ean13Text(code: string): string {
  return `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}`;
}

export function ean13Svg(
  code: string,
  options?: { module?: number; barHeight?: number },
): string {
  const modulePx = options?.module ?? 1.7;
  const barHeight = options?.barHeight ?? 72;
  const quiet = 11;
  const bits = ean13Modules(code);
  const width = (bits.length + quiet * 2) * modulePx;
  const textSize = 13;
  const height = barHeight + textSize + 6;
  let x = quiet * modulePx;
  let bars = "";
  for (const bit of bits) {
    if (bit === "1") {
      bars += `<rect x="${x}" y="0" width="${modulePx}" height="${barHeight}" fill="#111111"/>`;
    }
    x += modulePx;
  }
  const label = ean13Text(code);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" shape-rendering="crispEdges" role="img" aria-label="EAN-13 ${code}"><rect width="100%" height="100%" fill="#ffffff"/>${bars}<text x="${width / 2}" y="${barHeight + textSize}" text-anchor="middle" font-family="Geist Variable, sans-serif" font-size="${textSize}" fill="#111111">${label}</text></svg>`;
}
