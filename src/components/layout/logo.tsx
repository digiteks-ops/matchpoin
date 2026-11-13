import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface LogoProps {
  className?: string;
  showText?: boolean;
  variant?: "light" | "dark";
  layout?: "horizontal" | "vertical";
  size?: "sm" | "md" | "lg";
}

export function Logo({
  className,
  showText = true,
  variant = "light",
  layout = "horizontal",
  size = "md",
}: LogoProps) {
  const isDark = variant === "dark";
  const isVertical = layout === "vertical";

  const sizeClasses = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-12 h-12",
  };

  const textSizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
  };

  return (
    <Link
      href="/"
      className={cn(
        "inline-flex group select-none transition-opacity hover:opacity-95",
        isVertical ? "flex-col items-center text-center gap-2" : "items-center gap-2.5",
        className
      )}
    >
      <div className={cn("relative flex items-center justify-center shrink-0", sizeClasses[size])}>
        {/* Tennis court / ball motion abstract 'M' emblem */}
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full transform transition-transform group-hover:scale-105 duration-200"
        >
          {/* Background circle badge */}
          <rect width="40" height="40" rx="10" fill="#0B1F44" />

          {/* Dynamic letter M formed by tennis court baseline & motion curves */}
          <path
            d="M9 29V13L16.5 24L20 18.5L23.5 24L31 13V29"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Glowing Tennis Ball with seam lines at the peak of 'M' */}
          <circle cx="20" cy="12" r="5" fill="#A6FF00" />
          <path
            d="M17.5 10C18.5 11.5 18.5 12.5 17.5 14M22.5 10C21.5 11.5 21.5 12.5 22.5 14"
            stroke="#0B1F44"
            strokeWidth="1.1"
            strokeLinecap="round"
          />

          {/* Dynamic court sweep accent line */}
          <path
            d="M7 32C15 35 25 35 33 32"
            stroke="#A6FF00"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {showText && (
        <div className={cn("flex flex-col", isVertical ? "items-center" : "items-start")}>
          <div className="flex items-center tracking-tight leading-tight">
            <span
              className={cn(
                "font-extrabold font-heading tracking-tight",
                textSizeClasses[size],
                isDark ? "text-white" : "text-[#0B1F44]"
              )}
            >
              MATCH
            </span>
            <span
              className={cn(
                "font-extrabold font-heading text-[#84CC00] ml-0.5",
                textSizeClasses[size]
              )}
            >
              POIN
            </span>
          </div>
          <span className="text-[9px] font-semibold tracking-wider text-slate-400 uppercase -mt-0.5">
            Makassar • Tennis
          </span>
        </div>
      )}
    </Link>
  );
}
