const TZ = "America/Sao_Paulo";

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatLongDate(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function relativeTime(d: Date | string, now = new Date()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const mins = Math.round((now.getTime() - date.getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  if (days < 7) return `há ${days} dia${days > 1 ? "s" : ""}`;
  return formatDate(date);
}

export function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
}
