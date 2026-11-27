"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  referralSignupPath,
  referralSignupUrl,
} from "@/lib/referral/referral-core.mjs";
import { Check, Copy, Link2 } from "lucide-react";

export function ReferralLinkCard({
  code,
  count,
}: {
  code: string | null;
  count: number;
}) {
  const [copied, setCopied] = useState(false);
  const path = referralSignupPath(code);

  const copyLink = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(
        referralSignupUrl(window.location.origin, code)
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
          <Link2 className="h-3.5 w-3.5 text-matchpoin-tennis" />
          Tautan Referral
        </span>
        <span className="text-slate-500">{count} pendaftar</span>
      </div>
      {code ? (
        <>
          <p className="mt-2 truncate rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-600">
            {path}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={copyLink}
            className="mt-2 w-full gap-1.5 text-xs"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Tersalin" : "Salin Tautan"}
          </Button>
        </>
      ) : (
        <p className="mt-2 text-slate-500">
          Tautan referral belum aktif untuk komunitas ini.
        </p>
      )}
    </div>
  );
}