/** Label untuk pemain yang belum pernah tercatat login. */
export const LAST_SEEN_NEVER_LABEL: string;

/** Timestamp (ms) dari nilai waktu apa pun, atau null bila tidak valid. */
export function lastSeenTimestamp(value: string | Date | number | null | undefined): number | null;

/** Nilai pembanding untuk pengurutan; nilai kosong dianggap paling lama. */
export function lastSeenSortValue(value: string | Date | number | null | undefined): number;

/** Pembanding: login terbaru di atas, tanpa catatan login di bawah. */
export function compareByLastSeenDesc<T extends { lastSeenAt?: string | null }>(
  a: T,
  b: T,
  nameOf?: (item: T) => string | null | undefined
): number;

/** Label relatif singkat, mis. "3 jam lalu"; tanggal lengkap bila lebih lama. */
export function formatLastSeen(
  value: string | Date | number | null | undefined,
  now?: Date | number
): string;

/** Label lengkap tanggal + jam (Asia/Makassar), kosong bila belum pernah login. */
export function formatLastSeenExact(value: string | Date | number | null | undefined): string;