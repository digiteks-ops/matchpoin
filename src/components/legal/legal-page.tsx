import React from "react";
import Link from "next/link";
import { ShieldCheck, FileText, Mail, ArrowLeft } from "lucide-react";

export const LEGAL_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "matchpoin.id@gmail.com";

interface LegalPageProps {
  kind: "privacy" | "terms";
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}

export function LegalPage({ kind, title, updatedAt, children }: LegalPageProps) {
  const isPrivacy = kind === "privacy";

  return (
    <div className="bg-slate-50">
      <div className="container mx-auto max-w-3xl px-4 py-10 sm:px-6 md:py-14">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-matchpoin-navy"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali ke Beranda
        </Link>

        <header className="mt-4 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-matchpoin-navy/15 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-matchpoin-navy">
            {isPrivacy ? <ShieldCheck className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            {isPrivacy ? "Kebijakan Privasi" : "Ketentuan Layanan"}
          </div>
          <h1 className="font-heading text-2xl font-extrabold text-slate-900 sm:text-3xl">{title}</h1>
          <p className="text-xs text-slate-500">Terakhir diperbarui: {updatedAt}</p>
        </header>

        <nav className="mt-6 flex flex-wrap gap-2 text-xs">
          <Link
            href="/privacy"
            className={`rounded-lg border px-3 py-1.5 font-semibold transition-colors ${
              isPrivacy
                ? "border-matchpoin-navy bg-matchpoin-navy text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            Kebijakan Privasi
          </Link>
          <Link
            href="/terms"
            className={`rounded-lg border px-3 py-1.5 font-semibold transition-colors ${
              !isPrivacy
                ? "border-matchpoin-navy bg-matchpoin-navy text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            Ketentuan Layanan
          </Link>
        </nav>

        <article className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700 shadow-sm sm:p-8 [&_a]:font-semibold [&_a]:text-matchpoin-navy [&_a]:underline [&_h2]:mt-6 [&_h2]:font-heading [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_li]:space-y-1 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:space-y-1">
          {children}
        </article>

        <div className="mt-6 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-slate-400" />
            Pertanyaan hukum & privasi:
            <a className="font-semibold text-matchpoin-navy underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
              {LEGAL_CONTACT_EMAIL}
            </a>
          </span>
          <span>MATCHPOIN · Makassar, Sulawesi Selatan</span>
        </div>
      </div>
    </div>
  );
}
