export const DISPUTE_WINDOW_HOURS = 24;

export function disputeDeadlineFrom(submittedAt) {
  const date = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000);
}

export function isDisputeWindowOpen(deadline, now = new Date()) {
  if (!deadline) return false;
  const date = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(date.getTime())) return false;
  return now.getTime() < date.getTime();
}

export function normalizeResultStatus(status) {
  if (status === "confirmed") return "confirmed";
  if (status === "rejected") return "rejected";
  if (status === "under_review" || status === "disputed") return "under_review";
  if (status === "pending") return "pending";
  return "none";
}

export function normalizeResultViewStatus(status) {
  if (status === "confirmed") return "confirmed";
  if (status === "rejected") return "rejected";
  if (status === "under_review" || status === "disputed") return "under_review";
  return "pending";
}
