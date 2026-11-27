export const ERP_OPERATORS = [
  { email: "pcristinapacheco@gmail.com", name: "Paula" },
  { email: "renanbrmania@gmail.com", name: "Renan" },
] as const;

export function operatorName(email: string): string {
  const found = ERP_OPERATORS.find((row) => row.email === email.toLowerCase());
  if (found) return found.name;
  const local = email.split("@")[0];
  return local || email;
}

export function isListedOperator(email: string): boolean {
  return ERP_OPERATORS.some((row) => row.email === email.toLowerCase());
}
