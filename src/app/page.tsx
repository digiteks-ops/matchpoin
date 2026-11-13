import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Trophy,
  Calendar,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  MapPin,
  Flame,
} from "lucide-react";

export default function HomePage() {
  const ratingLevels = [
    {
      category: "Beginner",
      range: "1.00 – 2.99",
      desc: "Baru memulai olahraga tenis, membiasakan teknik pukulan dasar dan servis.",
      color: "bg-blue-50 text-blue-800 border-blue-200",
    },
    {
      category: "Upper Beginner",
      range: "3.00 – 4.49",
      desc: "Konsisten melakukan rally pukulan sedang, memahami penempatan posisi lapangan.",
      color: "bg-emerald-50 text-emerald-800 border-emerald-200",
    },
    {
      category: "Low Intermediate",
      range: "4.50 – 6.49",
      desc: "Menguasai variasi spin, kontrol kedalaman bola, serta ritme pertandingan kompetitif.",
      color: "bg-amber-50 text-amber-800 border-amber-200",
    },
    {
      category: "Upper Intermediate",
      range: "6.50 – 8.49",
      desc: "Pemain berpengalaman dengan kekuatan, antisipasi tinggi, dan taktik matang.",
      color: "bg-purple-50 text-purple-800 border-purple-200",
    },
    {
      category: "Advanced",
      range: "8.50+",
      desc: "Pemain turnamen tingkat tinggi dengan konsistensi luar biasa dan strategi level lanjut.",
      color: "bg-rose-50 text-rose-800 border-rose-200",
    },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-matchpoin-navy text-white pt-16 pb-20 md:py-28">
        {/* Abstract Background Accent Lines */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-matchpoin-tennis blur-3xl" />
          <div className="absolute top-1/2 -right-24 w-96 h-96 rounded-full bg-blue-500 blur-3xl" />
        </div>

        <div className="container relative z-10 mx-auto px-4 sm:px-6">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold backdrop-blur-md border border-white/20">
              <span className="w-2 h-2 rounded-full bg-matchpoin-tennis animate-pulse" />
              <span>Komunitas Tenis Makassar & Indonesia</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight font-heading leading-tight">
              Find Your Match. Play Your Best.
            </h1>

            <p className="text-lg sm:text-xl text-slate-300 max-w-2xl leading-relaxed">
              Temukan lawan, atur jadwal, dan mainkan pertandinganmu.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-4">
              <Link href="/register">
                <Button variant="tennis" size="lg" className="gap-2 text-matchpoin-navy font-bold">
                  Mulai Sekarang
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/players">
                <Button
                  variant="outline"
                  size="lg"
                  className="bg-white/10 text-white border-white/30 hover:bg-white/20 hover:text-white"
                >
                  Cari Pemain
                </Button>
              </Link>
            </div>

            {/* Quick stats / Highlights */}
            <div className="pt-8 grid grid-cols-2 sm:grid-cols-3 gap-4 border-t border-white/10 text-xs sm:text-sm">
              <div className="flex items-center gap-2 text-slate-300">
                <MapPin className="w-4 h-4 text-matchpoin-tennis shrink-0" />
                <span>Peluncuran Awal di Makassar</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck className="w-4 h-4 text-matchpoin-tennis shrink-0" />
                <span>Rating Independen Terverifikasi</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Flame className="w-4 h-4 text-matchpoin-tennis shrink-0" />
                <span>Tunggal & Ganda (Singles & Doubles)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Core Pillars */}
      <section className="py-16 md:py-24 bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold font-heading text-slate-900">
              Bagaimana MATCHPOIN Bekerja?
            </h2>
            <p className="text-slate-600 mt-2 text-sm sm:text-base">
              Tiga pilar utama untuk pengalaman bermain tenis yang lebih aktif dan kompetitif.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="hover:shadow-md transition-shadow border-slate-200">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-matchpoin-navy text-matchpoin-tennis flex items-center justify-center mb-2">
                  <Users className="w-6 h-6" />
                </div>
                <CardTitle>1. Temukan Lawan Seimbang</CardTitle>
                <CardDescription className="text-slate-600">
                  Pilih lawan sesuai lokasi, level, dan jadwal bermain.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-md transition-shadow border-slate-200">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-matchpoin-navy text-matchpoin-tennis flex items-center justify-center mb-2">
                  <Calendar className="w-6 h-6" />
                </div>
                <CardTitle>2. Buat & Gabung Match</CardTitle>
                <CardDescription className="text-slate-600">
                  Buat pertandingan atau gabung yang sedang dibuka.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-md transition-shadow border-slate-200">
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-matchpoin-navy text-matchpoin-tennis flex items-center justify-center mb-2">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <CardTitle>3. Input Skor & Pantau Rating</CardTitle>
                <CardDescription className="text-slate-600">
                  Kirim skor. Rating diperbarui setelah dikonfirmasi.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* MATCHPOIN Rating System Explanation */}
      <section className="py-16 md:py-24 bg-slate-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mb-12">
            <Badge variant="tennis" className="mb-3">
              Transparan & Adil
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-bold font-heading text-slate-900">
              Kategori MATCHPOIN Rating
            </h2>
            <p className="text-slate-600 mt-2 text-sm sm:text-base">
              Sistem rating MATCHPOIN adalah metrik independen internal yang objektif. Rating awal pemain baru berstatus provisori hingga terverifikasi melalui pertandingan resmi.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {ratingLevels.map((lvl) => (
              <div
                key={lvl.category}
                className="bg-white rounded-xl p-5 border border-slate-200/90 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold border mb-3 ${lvl.color}`}>
                    {lvl.range}
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">{lvl.category}</h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">{lvl.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-xs sm:text-sm text-slate-700">
                Semua pemain terdaftar mulai dengan Rating Provisori 1.00 dan berkembang sesuai performa match nyata.
              </p>
            </div>
            <Link href="/register">
              <Button variant="outline" size="sm" className="whitespace-nowrap">
                Mulai dari Sini
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Guest Mode Callout */}
      <section className="py-12 bg-matchpoin-navy text-white text-center">
        <div className="container mx-auto px-4 sm:px-6 max-w-2xl space-y-4">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading">
            Siap bermain?
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Temukan lawan, atur jadwal, dan mainkan pertandinganmu.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <Link href="/register">
              <Button variant="tennis" size="lg">
                Mulai Sekarang
              </Button>
            </Link>
            <Link href="/players">
              <Button variant="outline" size="lg" className="border-white/30 text-white bg-transparent hover:bg-white/10">
                Cari Pemain
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
