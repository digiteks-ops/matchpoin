import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Today's calendar date (YYYY-MM-DD) in the platform timezone (Asia/Makassar).
 * Server and client agree because the timezone is explicit.
 */
export function todayInPlatformTimeZone(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Builds a timezone-aware ISO string from a date and a time value.
 * Returns null when the input cannot be parsed.
 */
export function toPlatformIsoString(date: string, time: string): string | null {
  const normalized = time.length === 5 ? `${time}:00` : time;
  const parsed = new Date(`${date}T${normalized}+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Format currency in Indonesian Rupiah (IDR)
 */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format date in Indonesian locale (Makassar timezone friendly)
 */
export function formatIndonesianDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;

  // Intl forbids mixing dateStyle with component options such as weekday/day/month.
  const hasComponents = Boolean(
    options &&
      (options.weekday !== undefined ||
        options.year !== undefined ||
        options.month !== undefined ||
        options.day !== undefined ||
        options.era !== undefined)
  );

  const resolved: Intl.DateTimeFormatOptions = hasComponents
    ? { timeZone: "Asia/Makassar", ...options }
    : { timeZone: "Asia/Makassar", dateStyle: "medium", ...options };

  return new Intl.DateTimeFormat("id-ID", resolved).format(d);
}

/**
 * Format 24-hour time in Indonesian locale
 */
export function formatIndonesianTime(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...options,
  }).format(d);
}
