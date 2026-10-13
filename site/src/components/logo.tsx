import { useId } from "react";
import { cn } from "@/lib/utils";

// Floppy mark: a document-shaped disk with a folded corner and an F cut out
// of it. The F and the gap around the fold are holes (a mask), not white
// paint, so the mark works on light and dark backgrounds. Canonical file:
// /branding/floppy-mark.svg.
const BRAND_ORANGE = "#FF5722";
const BODY =
  "M25 0H61V26A13 13 0 0 0 74 39H100V82Q100 99 84 105L30 120H25A25 25 0 0 1 0 95V25A25 25 0 0 1 25 0Z";
const FOLD = "M66 1V23A12 12 0 0 0 78 35H100Z";
const LETTER_F =
  "M23 126V66A17 17 0 0 1 40 49H80.5A1.5 1.5 0 0 1 81.6 51.5L71 64H40A10 10 0 0 0 30 74V77H58A8 8 0 0 1 58 93H40A10 10 0 0 0 30 103V126Z";

export function Logomark({ className }: { className?: string }) {
  const maskId = useId();
  return (
    <svg
      viewBox="-4 -4 108 128"
      className={className}
      role="img"
      aria-label="Floppy"
    >
      <defs>
        <mask id={maskId}>
          <rect x="-4" y="-4" width="108" height="128" fill="#fff" />
          <path d={LETTER_F} fill="#000" />
        </mask>
      </defs>
      <g fill={BRAND_ORANGE}>
        <path d={BODY} mask={`url(#${maskId})`} />
        <path d={FOLD} />
      </g>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex h-8 items-center gap-2", className)}
      role="img"
      aria-label="Floppy"
    >
      <Logomark className="h-full w-auto" />
      <span
        aria-hidden
        className="text-[1.4em] leading-none font-bold tracking-tight text-foreground"
      >
        Floppy
      </span>
    </span>
  );
}
