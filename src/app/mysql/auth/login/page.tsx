import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function queryString(searchParams: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export default function LegacyMySqlLoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  redirect(`/login${queryString(searchParams)}`);
}
