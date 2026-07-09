import type { ReactElement } from "react";
import type { MemberIconKey } from "./types";

type IconProps = { size?: number };

const stroke = "currentColor";

export function BrainLogoIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#1D4E89" />
      <path
        d="M12.5 9c-1.7 0-3 1.3-3 2.9 0 .3 0 .6.1.9-1.1.5-1.9 1.6-1.9 2.9 0 1 .5 1.9 1.3 2.5-.2.4-.3.9-.3 1.4 0 1.7 1.4 3.1 3.1 3.1.3 0 .6 0 .9-.1.4 1 1.4 1.7 2.5 1.7s2.1-.7 2.5-1.7c.3.1.6.1.9.1 1.7 0 3.1-1.4 3.1-3.1 0-.5-.1-1-.3-1.4.8-.6 1.3-1.5 1.3-2.5 0-1.3-.8-2.4-1.9-2.9.1-.3.1-.6.1-.9 0-1.6-1.3-2.9-3-2.9-.7 0-1.3.2-1.8.6-.5-.9-1.5-1.5-2.6-1.5-.4 0-.8.1-1.2.2"
        stroke="white"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 11v10M13 14.2h2M17 14.2h2M12.8 17.4h2.4M16.8 17.4h2.4" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

// Larger, muted outline version used for the "no active loans" empty state
export function BrainOutlineIcon({ size = 40 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12.5 9c-1.7 0-3 1.3-3 2.9 0 .3 0 .6.1.9-1.1.5-1.9 1.6-1.9 2.9 0 1 .5 1.9 1.3 2.5-.2.4-.3.9-.3 1.4 0 1.7 1.4 3.1 3.1 3.1.3 0 .6 0 .9-.1.4 1 1.4 1.7 2.5 1.7s2.1-.7 2.5-1.7c.3.1.6.1.9.1 1.7 0 3.1-1.4 3.1-3.1 0-.5-.1-1-.3-1.4.8-.6 1.3-1.5 1.3-2.5 0-1.3-.8-2.4-1.9-2.9.1-.3.1-.6.1-.9 0-1.6-1.3-2.9-3-2.9-.7 0-1.3.2-1.8.6-.5-.9-1.5-1.5-2.6-1.5-.4 0-.8.1-1.2.2"
        stroke={stroke}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 11v10M13 14.2h2M17 14.2h2M12.8 17.4h2.4M16.8 17.4h2.4" stroke={stroke} strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export function PersonIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="3.4" stroke={stroke} strokeWidth="1.6" />
      <path d="M5.5 20c1.2-3.6 4-5.4 6.5-5.4s5.3 1.8 6.5 5.4" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 6l6 6-6 6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6L6 18" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MailIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke={stroke} strokeWidth="1.6" />
      <path d="M4.5 7l7.5 5.5L19.5 7" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PinIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 21s7-6.4 7-11.5A7 7 0 105 9.5C5 14.6 12 21 12 21z"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.3" stroke={stroke} strokeWidth="1.6" />
    </svg>
  );
}

export function HandleIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke={stroke} strokeWidth="1.6" />
      <circle cx="12" cy="11" r="3" stroke={stroke} strokeWidth="1.6" />
      <path d="M7.5 18c.8-2 2.5-3 4.5-3s3.7 1 4.5 3" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5v14M5 12h14" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function WarningIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 3.5l9.5 16.5H2.5L12 3.5z"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 10v4.2" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 17.1h.01" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

const actionIconPaths: Record<MemberIconKey, ReactElement> = {
  browse: (
    <>
      <rect x="3.5" y="4.5" width="17" height="6" rx="1.4" stroke={stroke} strokeWidth="1.6" />
      <rect x="3.5" y="13.5" width="17" height="6" rx="1.4" stroke={stroke} strokeWidth="1.6" />
      <path d="M7 7.5h.01M7 16.5h.01" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  loans: (
    <>
      <circle cx="12" cy="12" r="8.2" stroke={stroke} strokeWidth="1.6" />
      <path d="M12 8v4.3l3 2" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Matches the wireframe exactly: a plain plus, not a document/page icon.
  documentation: <path d="M12 5v14M5 12h14" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />,
  support: (
    <>
      <circle cx="12" cy="12" r="8.5" stroke={stroke} strokeWidth="1.5" />
      <path d="M9.3 9.6a2.7 2.7 0 015.2.9c0 1.8-2.4 2-2.4 3.7" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 17.2h.01" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
};

export function ActionIcon({ icon, size = 18 }: { icon: MemberIconKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {actionIconPaths[icon]}
    </svg>
  );
}

// Generic placeholder shown in the "My hardware" thumbnail until real item
// photos come from the inventory system.
export function DeviceIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="7" width="16" height="11" rx="2" stroke={stroke} strokeWidth="1.5" />
      <path d="M8 7V5.5a1.5 1.5 0 011.5-1.5h5a1.5 1.5 0 011.5 1.5V7" stroke={stroke} strokeWidth="1.5" />
      <path d="M8 12h8M8 15h5" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
