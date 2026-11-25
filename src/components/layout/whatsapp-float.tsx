"use client";

import React from "react";
import { MessageCircle } from "lucide-react";
import {
  ADMIN_WHATSAPP_NUMBER,
  adminWhatsappUrl,
} from "@/lib/notifications/whatsapp-core.mjs";

const DEFAULT_MESSAGE = "Halo Admin MATCHPOIN, saya ingin bertanya.";

/**
 * Tombol mengambang "Chat Admin" di kanan bawah setiap halaman.
 *
 * Memakai tautan `wa.me` biasa, bukan Widget API: tidak butuh script pihak
 * ketiga, tetap jalan walau WhatsApp Web belum login, dan aman untuk perangkat
 * yang tidak memasang aplikasi WhatsApp.
 */
export function WhatsappFloat() {
  const href = adminWhatsappUrl(DEFAULT_MESSAGE);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat Admin lewat WhatsApp"
      className="group fixed bottom-5 right-4 z-40 flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-white shadow-lg shadow-emerald-600/30 transition-all hover:bg-emerald-700 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
      title={`Chat Admin WhatsApp (+${ADMIN_WHATSAPP_NUMBER})`}
    >
      <MessageCircle className="h-5 w-5 shrink-0" />
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-bold transition-all duration-300 group-hover:max-w-[8rem] group-focus-visible:max-w-[8rem] sm:max-w-none">
        Chat Admin
      </span>
    </a>
  );
}