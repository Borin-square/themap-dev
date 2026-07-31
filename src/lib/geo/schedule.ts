/**
 * Utilities per calcolo next-run delle schedule ricorrenti.
 * Timezone-agnostic: usa il fuso dell'ambiente (server = UTC su Vercel).
 * Se serve una TZ specifica va reintrodotto un offset esplicito.
 */

export type Cadence = "daily" | "weekly" | "monthly";

/**
 * Calcola la prossima occorrenza strettamente > `from`.
 * - daily: prossima H:M
 * - weekly: prossimo dow (0=domenica) alle H:M
 * - monthly: prossimo day_of_month alle H:M
 */
export function computeNextRun(
  cadence: Cadence,
  dow: number | null | undefined,
  dayOfMonth: number | null | undefined,
  hour: number,
  minute: number,
  from: Date = new Date(),
): Date {
  if (cadence === "daily") {
    const d = new Date(from);
    d.setUTCHours(hour, minute, 0, 0);
    if (d <= from) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  if (cadence === "weekly") {
    const targetDow = dow ?? 1; // default lunedì
    const d = new Date(from);
    d.setUTCHours(hour, minute, 0, 0);
    // Portalo al prossimo dow ≥ oggi
    const currentDow = d.getUTCDay();
    let diff = (targetDow - currentDow + 7) % 7;
    if (diff === 0 && d <= from) diff = 7;
    d.setUTCDate(d.getUTCDate() + diff);
    return d;
  }
  // monthly
  const targetDay = dayOfMonth ?? 1;
  const d = new Date(from);
  d.setUTCDate(targetDay);
  d.setUTCHours(hour, minute, 0, 0);
  if (d <= from) {
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(targetDay);
  }
  return d;
}

export const DOW_LABELS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
