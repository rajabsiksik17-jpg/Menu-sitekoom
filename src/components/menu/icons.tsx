/**
 * Line icons of the customer pages (one consistent set: 24×24, 2px stroke, current text colour), instead of emoji —
 * they look the same on every phone, follow the restaurant's theme colours and stay crisp at any size.
 */
type P = { className?: string; strokeWidth?: number };

function Svg({ className = "size-5", strokeWidth = 2, children }: P & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 ${className}`} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconMinus = (p: P) => <Svg {...p}><path d="M5 12h14" /></Svg>;
export const IconX = (p: P) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>;
export const IconTrash = (p: P) => <Svg {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
export const IconStar = (p: P) => <Svg {...p}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" /></Svg>;
export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const IconPin = (p: P) => <Svg {...p}><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></Svg>;
export const IconPhone = (p: P) => <Svg {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></Svg>;
export const IconChat = (p: P) => <Svg {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Svg>;
export const IconTable = (p: P) => <Svg {...p}><path d="M3 9h18M5 9v11M19 9v11M7 9V5h10v4" /></Svg>;
export const IconReceipt = (p: P) => <Svg {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></Svg>;
export const IconPrinter = (p: P) => <Svg {...p}><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /></Svg>;
export const IconHourglass = (p: P) => <Svg {...p}><path d="M6 3h12M6 21h12M7 3c0 4 5 5 5 9s-5 5-5 9M17 3c0 4-5 5-5 9s5 5 5 9" /></Svg>;
export const IconBell = (p: P) => <Svg {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" /></Svg>;
export const IconCircleX = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></Svg>;
export const IconCircleCheck = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></Svg>;
export const IconUtensils = (p: P) => <Svg {...p}><path d="M5 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M7 13v8M17 21V3c-2 1-3 4-3 7s1 3 3 3" /></Svg>;
export const IconFilter = (p: P) => <Svg {...p}><path d="M4 6h16M7 12h10M10 18h4" /></Svg>;
export const IconEdit = (p: P) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16v4z" /></Svg>;
