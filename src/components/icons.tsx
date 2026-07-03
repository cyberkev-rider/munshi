/**
 * Hand-rolled inline SVG icons. No icon library dependency — keeps the
 * bundle small and every icon trivially themeable via currentColor.
 *
 * Icon meaning is load-bearing for semi-literate users, so keep these two
 * consistent everywhere in the app:
 *  - MoneyInIcon  (arrow down INTO a wallet) = "received" = GREEN
 *  - MoneyOutIcon (arrow up OUT of a wallet)  = "paid"     = RED
 */

interface IconProps {
  className?: string;
}

/** Money received: arrow pointing down into an open wallet. Use with green. */
export function MoneyInIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="6" y="22" width="36" height="20" rx="4" stroke="currentColor" strokeWidth="3" fill="none" />
      <path d="M6 28h9a3 3 0 0 1 3 3 3 3 0 0 0 3 3h6a3 3 0 0 0 3-3 3 3 0 0 1 3-3h9" stroke="currentColor" strokeWidth="3" fill="none" />
      <path d="M24 4v18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M16 15l8 8 8-8" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Money paid: arrow pointing up out of an open wallet. Use with red. */
export function MoneyOutIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="6" y="22" width="36" height="20" rx="4" stroke="currentColor" strokeWidth="3" fill="none" />
      <path d="M6 28h9a3 3 0 0 1 3 3 3 3 0 0 0 3 3h6a3 3 0 0 0 3-3 3 3 0 0 1 3-3h9" stroke="currentColor" strokeWidth="3" fill="none" />
      <path d="M24 22V4" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M16 11l8-8 8 8" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Microphone icon for the voice-entry button. */
export function MicIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="17" y="4" width="14" height="24" rx="7" stroke="currentColor" strokeWidth="3" fill="none" />
      <path d="M10 22a14 14 0 0 0 28 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M24 36v8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M16 44h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Camera icon for the (stubbed) photo-of-bill button. */
export function CameraIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M17 10l2.5-4h9L31 10h7a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3h7z" stroke="currentColor" strokeWidth="3" fill="none" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="8" stroke="currentColor" strokeWidth="3" fill="none" />
    </svg>
  );
}

/** Plus icon for the "add new entry" buttons. */
export function PlusIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M24 10v28M10 24h28" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Trash icon for delete actions. */
export function TrashIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M9 14h30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M17 14V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5" stroke="currentColor" strokeWidth="3" fill="none" />
      <path d="M13 14l1.5 27a2 2 0 0 0 2 1.9h15a2 2 0 0 0 2-1.9L35 14" stroke="currentColor" strokeWidth="3" fill="none" strokeLinejoin="round" />
      <path d="M20 21v14M28 21v14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Back-arrow (chevron) icon for navigation. */
export function BackIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M30 8L14 24l16 16" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Backspace icon for the custom number pad. */
export function BackspaceIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M17 12h22a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H17L6 24l11-12z" stroke="currentColor" strokeWidth="3" fill="none" strokeLinejoin="round" />
      <path d="M22 19l10 10M32 19l-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Person icon for party avatars/lists. */
export function PersonIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="24" cy="16" r="8" stroke="currentColor" strokeWidth="3" fill="none" />
      <path d="M8 42c0-8.8 7.2-16 16-16s16 7.2 16 16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Checkmark icon for confirmation screens. */
export function CheckIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3" fill="none" />
      <path d="M15 24l6 6 12-13" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
