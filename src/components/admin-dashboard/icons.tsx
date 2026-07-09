import type { ReactElement } from "react";
import type { IconKey } from "../../types";

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

export function PersonIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="3.4" stroke={stroke} strokeWidth="1.6" />
      <path d="M5.5 20c1.2-3.6 4-5.4 6.5-5.4s5.3 1.8 6.5 5.4" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ClockIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8.2" stroke={stroke} strokeWidth="1.6" />
      <path d="M12 8v4.3l3 2" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="6.5" stroke={stroke} strokeWidth="1.7" />
      <path d="M20 20l-4.3-4.3" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
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

const actionIconPaths: Record<IconKey, ReactElement> = {
  inventory: (
    <>
      <rect x="3.5" y="4.5" width="17" height="6" rx="1.4" stroke={stroke} strokeWidth="1.6" />
      <rect x="3.5" y="13.5" width="17" height="6" rx="1.4" stroke={stroke} strokeWidth="1.6" />
      <path d="M7 7.5h.01M7 16.5h.01" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  add: <path d="M12 5v14M5 12h14" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />,
  label: (
    <>
      <path
        d="M4 12l7.3-7.3a2 2 0 011.4-.6H18a2 2 0 012 2v5.3a2 2 0 01-.6 1.4L12.1 20a2 2 0 01-2.8 0L4 14.7a2 2 0 010-2.8z"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="15" cy="9" r="1.4" stroke={stroke} strokeWidth="1.4" />
    </>
  ),
  checkout: <path d="M7 17L17 7M7 7h10v10" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  return: <path d="M17 7L7 17M17 17H7V7" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  list: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="8" r="2.8" stroke={stroke} strokeWidth="1.5" />
      <path d="M3.8 19c1-3 3-4.6 5.2-4.6s4.2 1.6 5.2 4.6" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="17.5" cy="8.5" r="2" stroke={stroke} strokeWidth="1.4" />
      <path d="M16 14.7c1.8.2 3.4 1.5 4.2 4" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  "find-member": (
    <>
      <circle cx="10.5" cy="8" r="3" stroke={stroke} strokeWidth="1.5" />
      <path d="M4.5 19c1-3.3 3.4-5 6-5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="17" cy="17" r="3" stroke={stroke} strokeWidth="1.4" />
      <path d="M19.2 19.2L21.5 21.5" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  "manage-admins": (
    <>
      <circle cx="10" cy="8" r="3" stroke={stroke} strokeWidth="1.5" />
      <path d="M4 19c1-3.3 3.4-5 6-5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16.5 8.5l1 1 2-2" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17.5" cy="8" r="3.4" stroke={stroke} strokeWidth="1.2" />
    </>
  ),
  "mail-member": (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke={stroke} strokeWidth="1.5" />
      <path d="M4.5 7l7.5 5.5L19.5 7" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19" cy="6" r="3" fill="white" stroke={stroke} strokeWidth="1.3" />
      <path d="M17.7 6h2.6M19 4.7v2.6" stroke={stroke} strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  "mail-admin": (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke={stroke} strokeWidth="1.5" />
      <path d="M4.5 7l7.5 5.5L19.5 7" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 17.5l1 1 2-2" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "mail-log": (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke={stroke} strokeWidth="1.5" />
      <path d="M4.5 7l7.5 5.5L19.5 7" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 21h6" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
};

export function ActionIcon({ icon, size = 18 }: { icon: IconKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {actionIconPaths[icon]}
    </svg>
  );
}
