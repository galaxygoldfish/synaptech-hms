import type { ReactElement } from "react";
import type { IconKey } from "../../types";

type IconProps = { size?: number; className?: string };

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

export function PersonIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
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

export function ArrowLeftIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M19 12H5M11 6l-6 6 6 6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ImageIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" stroke={stroke} strokeWidth="1.6" />
      <circle cx="8.5" cy="10" r="1.6" stroke={stroke} strokeWidth="1.4" />
      <path d="M4 16.5l5-4.5 4 3.5 3-3 4 4" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CalendarIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.8" stroke={stroke} strokeWidth="1.6" />
      <path d="M3.5 9.5h17M7.5 3v3.5M16.5 3v3.5" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
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

// ── Filled icon set (matches Figma wireframe exactly) ────────────────────

export function SearchIconFilled({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 25.3457 25.3457" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M25.3457 24.02L18.2656 16.9399C19.9669 14.8974 20.8153 12.2776 20.6342 9.6256C20.4532 6.97356 19.2566 4.49341 17.2936 2.70109C15.3305 0.908772 12.752 -0.0577213 10.0944 0.00266874C7.43691 0.0630587 4.90497 1.14568 3.02532 3.02532C1.14568 4.90497 0.0630587 7.43691 0.00266874 10.0944C-0.0577213 12.752 0.908772 15.3305 2.70109 17.2936C4.49341 19.2566 6.97356 20.4532 9.6256 20.6342C12.2776 20.8153 14.8974 19.9669 16.9399 18.2656L24.02 25.3457L25.3457 24.02ZM1.90818 10.3457C1.90818 8.6769 2.40303 7.0456 3.33016 5.65806C4.25728 4.27052 5.57504 3.18906 7.11679 2.55045C8.65854 1.91183 10.355 1.74474 11.9918 2.07031C13.6285 2.39587 15.1319 3.19946 16.3119 4.37947C17.4919 5.55947 18.2955 7.06289 18.6211 8.69961C18.9466 10.3363 18.7795 12.0328 18.1409 13.5746C17.5023 15.1163 16.4208 16.4341 15.0333 17.3612C13.6458 18.2883 12.0145 18.7832 10.3457 18.7832C8.10868 18.7807 5.96401 17.891 4.38221 16.3092C2.80041 14.7274 1.91066 12.5827 1.90818 10.3457V10.3457Z" fill="#C4C4C4" />
    </svg>
  );
}

export function BrowseIconFilled({ size = 22, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21.875 21.875" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M7.8125 17.1875H1.5625V20.3125H7.8125V21.875H1.5625C1.14825 21.8745 0.75093 21.7099 0.458008 21.417C0.165085 21.1241 0.000475573 20.7268 0 20.3125V17.1875C0.000475573 16.7732 0.165085 16.3759 0.458008 16.083C0.75093 15.7901 1.14825 15.6255 1.5625 15.625H7.8125V17.1875ZM15.625 12.5C16.9454 12.5406 18.2247 12.9678 19.3047 13.7285C20.3847 14.4893 21.2184 15.5506 21.7012 16.7803L21.875 17.1875L21.7012 17.5947C21.2184 18.8244 20.3847 19.8857 19.3047 20.6465C18.2247 21.4072 16.9454 21.8344 15.625 21.875C14.3046 21.8344 13.0253 21.4072 11.9453 20.6465C10.8653 19.8857 10.0316 18.8244 9.54883 17.5947L9.375 17.1875L9.54883 16.7803C10.0316 15.5506 10.8653 14.4893 11.9453 13.7285C13.0253 12.9678 14.3046 12.5406 15.625 12.5ZM16.8213 14.3008C16.2504 14.0643 15.6217 14.0016 15.0156 14.1221C14.4094 14.2426 13.8521 14.5405 13.415 14.9775C12.978 15.4146 12.6801 15.9719 12.5596 16.5781C12.4391 17.1842 12.5018 17.8129 12.7383 18.3838C12.9748 18.9546 13.3749 19.4429 13.8887 19.7861C14.4026 20.1295 15.0069 20.3125 15.625 20.3125C16.4535 20.3116 17.2481 19.9823 17.834 19.3965C18.4198 18.8106 18.7491 18.016 18.75 17.1875C18.75 16.5694 18.567 15.9651 18.2236 15.4512C17.8804 14.9374 17.3921 14.5373 16.8213 14.3008ZM15.625 15.5371C16.4879 15.5371 17.1875 16.2367 17.1875 17.0996C17.1874 17.9624 16.4879 18.6621 15.625 18.6621C14.7621 18.6621 14.0626 17.9624 14.0625 17.0996C14.0625 16.2367 14.7621 15.5371 15.625 15.5371ZM20.3125 7.8125C20.7268 7.81298 21.1241 7.97759 21.417 8.27051C21.7099 8.56343 21.8745 8.96075 21.875 9.375V10.9375H20.3135L20.3125 9.375H3.90625V12.5H7.8125V14.0625H3.90625C3.492 14.062 3.09468 13.8974 2.80176 13.6045C2.50884 13.3116 2.34423 12.9143 2.34375 12.5V9.375C2.34423 8.96075 2.50884 8.56343 2.80176 8.27051C3.09468 7.97759 3.492 7.81298 3.90625 7.8125H20.3125ZM17.9688 0C18.383 0.000434297 18.7803 0.165076 19.0732 0.458008C19.3662 0.750939 19.5308 1.14823 19.5312 1.5625V4.6875C19.5308 5.10177 19.3662 5.49906 19.0732 5.79199C18.7803 6.08492 18.383 6.24957 17.9688 6.25H1.5625C1.14823 6.24957 0.750939 6.08492 0.458008 5.79199C0.165076 5.49906 0.000434297 5.10177 0 4.6875V1.5625C0.000434297 1.14823 0.165076 0.750939 0.458008 0.458008C0.750939 0.165076 1.14823 0.000434297 1.5625 0H17.9688ZM1.5625 4.6875H17.9688V1.5625H1.5625V4.6875Z" fill={color} />
    </svg>
  );
}

export function ChevronRightFilled({ size = 9, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size * (15.625 / 8.90625)} viewBox="0 0 8.90625 15.625" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M8.90625 7.8125L1.09375 15.625L0 14.5313L6.71875 7.8125L0 1.09375L1.09375 0L8.90625 7.8125Z" fill={color} />
    </svg>
  );
}

export function PlusIconSmallFilled({ size = 15, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M8.4375 6.5625V0H6.5625V6.5625H0V8.4375H6.5625V15H8.4375V8.4375H15V6.5625H8.4375Z" fill={color} />
    </svg>
  );
}

export function PrinterIconFilled({ size = 22, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size * (20.3125 / 21.875)} viewBox="0 0 21.875 20.3125" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M20.3125 4.6875H17.9688V0H3.90625V4.6875H1.5625C1.1481 4.6875 0.750671 4.85212 0.457646 5.14515C0.16462 5.43817 0 5.8356 0 6.25V14.0625C0 14.4769 0.16462 14.8743 0.457646 15.1674C0.750671 15.4604 1.1481 15.625 1.5625 15.625H3.90625V20.3125H17.9688V15.625H20.3125C20.7269 15.625 21.1243 15.4604 21.4174 15.1674C21.7104 14.8743 21.875 14.4769 21.875 14.0625V6.25C21.875 5.8356 21.7104 5.43817 21.4174 5.14515C21.1243 4.85212 20.7269 4.6875 20.3125 4.6875ZM5.46875 1.5625H16.4062V4.6875H5.46875V1.5625ZM16.4062 18.75H5.46875V10.9375H16.4062V18.75ZM20.3125 14.0625H17.9688V9.375H3.90625V14.0625H1.5625V6.25H20.3125V14.0625Z" fill={color} />
    </svg>
  );
}

export function ArrowUpLeftFilled({ size = 22, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 15.625 15.625" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M12.5 0V1.5625H2.66406L15.625 14.5234L14.5234 15.625L1.5625 2.66406V12.5H0V0H12.5Z" fill={color} />
    </svg>
  );
}

export function ArrowDownRightFilled({ size = 22, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 15.625 15.625" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M3.125 15.625V14.0625H12.9609L0 1.10156L1.10156 0L14.0625 12.9609V3.125H15.625V15.625H3.125Z" fill={color} />
    </svg>
  );
}

export function ServerIconFilled({ size = 19, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size * (21.875 / 18.75)} viewBox="0 0 18.75 21.875" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M17.1875 15.625C17.6018 15.6254 17.9991 15.7901 18.292 16.083C18.5849 16.3759 18.7496 16.7732 18.75 17.1875V20.3125C18.7496 20.7268 18.5849 21.1241 18.292 21.417C17.9991 21.7099 17.6018 21.8746 17.1875 21.875H1.5625C1.14823 21.8746 0.750939 21.7099 0.458008 21.417C0.165076 21.1241 0.000434297 20.7268 0 20.3125V17.1875C0.000434297 16.7732 0.165076 16.3759 0.458008 16.083C0.750939 15.7901 1.14823 15.6254 1.5625 15.625H17.1875ZM1.5625 20.3125H17.1875V17.1875H1.5625V20.3125ZM3.90625 17.9688C4.33772 17.9688 4.6875 18.3185 4.6875 18.75C4.6875 19.1815 4.33772 19.5312 3.90625 19.5312C3.47478 19.5312 3.125 19.1815 3.125 18.75C3.125 18.3185 3.47478 17.9688 3.90625 17.9688ZM17.1875 7.8125C17.6018 7.81293 17.9991 7.97758 18.292 8.27051C18.5849 8.56344 18.7496 8.96073 18.75 9.375V12.5C18.7496 12.9143 18.5849 13.3116 18.292 13.6045C17.9991 13.8974 17.6018 14.0621 17.1875 14.0625H1.5625C1.14823 14.0621 0.750939 13.8974 0.458008 13.6045C0.165076 13.3116 0.000434297 12.9143 0 12.5V9.375C0.000434297 8.96073 0.165076 8.56344 0.458008 8.27051C0.750939 7.97758 1.14823 7.81293 1.5625 7.8125H17.1875ZM1.5625 12.5H17.1875V9.375H1.5625V12.5ZM3.90625 10.1562C4.33772 10.1562 4.6875 10.506 4.6875 10.9375C4.6875 11.369 4.33772 11.7188 3.90625 11.7188C3.47478 11.7188 3.125 11.369 3.125 10.9375C3.125 10.506 3.47478 10.1562 3.90625 10.1562ZM17.1875 0C17.6018 0.000434297 17.9991 0.165076 18.292 0.458008C18.5849 0.750939 18.7496 1.14823 18.75 1.5625V4.6875C18.7496 5.10177 18.5849 5.49906 18.292 5.79199C17.9991 6.08492 17.6018 6.24957 17.1875 6.25H1.5625C1.14823 6.24957 0.750939 6.08492 0.458008 5.79199C0.165076 5.49906 0.000434297 5.10177 0 4.6875V1.5625C0.000434297 1.14823 0.165076 0.750939 0.458008 0.458008C0.750939 0.165076 1.14823 0.000434297 1.5625 0H17.1875ZM1.5625 4.6875H17.1875V1.5625H1.5625V4.6875ZM3.90625 2.34375C4.33772 2.34375 4.6875 2.69353 4.6875 3.125C4.6875 3.55647 4.33772 3.90625 3.90625 3.90625C3.47478 3.90625 3.125 3.55647 3.125 3.125C3.125 2.69353 3.47478 2.34375 3.90625 2.34375Z" fill={color} />
    </svg>
  );
}

export function UserProfileIconFilled({ size = 24, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size * (21.875 / 23.4375)} viewBox="0 0 23.4375 21.875" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M10.1562 12.5C11.6067 12.5 12.9978 13.076 14.0234 14.1016C15.049 15.1272 15.625 16.5183 15.625 17.9688V21.875H14.0625V17.9688C14.0625 16.9327 13.6505 15.9396 12.918 15.207C12.1854 14.4745 11.1923 14.0625 10.1562 14.0625H5.46875C4.43275 14.0625 3.4396 14.4745 2.70703 15.207C1.97447 15.9396 1.5625 16.9327 1.5625 17.9688V21.875H0V17.9688C0 16.5183 0.575973 15.1272 1.60156 14.1016C2.62715 13.076 4.01835 12.5 5.46875 12.5H10.1562ZM21.0938 9.375V10.9375H15.625V9.375H21.0938ZM7.8125 0C9.2629 0 10.6541 0.575974 11.6797 1.60156C12.7053 2.62715 13.2812 4.01835 13.2812 5.46875C13.2812 6.55036 12.9603 7.60751 12.3594 8.50684C11.7585 9.40617 10.9046 10.1076 9.90527 10.5215C8.90602 10.9354 7.80591 11.043 6.74512 10.832C5.68449 10.6209 4.71 10.1006 3.94531 9.33594C3.18062 8.57125 2.6603 7.59676 2.44922 6.53613C2.23821 5.47534 2.34589 4.37523 2.75977 3.37598C3.17368 2.37669 3.87508 1.52279 4.77441 0.921875C5.67374 0.320972 6.73089 0 7.8125 0ZM7.8125 1.5625C6.7765 1.5625 5.78334 1.97447 5.05078 2.70703C4.31822 3.4396 3.90625 4.43275 3.90625 5.46875C3.90625 6.24123 4.13533 6.99635 4.56445 7.63867C4.99367 8.28103 5.60363 8.78247 6.31738 9.07812C7.03106 9.37374 7.81658 9.45044 8.57422 9.2998C9.33196 9.14908 10.0279 8.77677 10.5742 8.23047C11.1205 7.68417 11.4928 6.98821 11.6436 6.23047C11.7942 5.47283 11.7175 4.68731 11.4219 3.97363C11.1262 3.25988 10.6248 2.64992 9.98242 2.2207C9.3401 1.79158 8.58498 1.5625 7.8125 1.5625ZM23.4375 7.03125H15.625V5.46875H23.4375V7.03125ZM23.4375 3.125H15.625V1.5625H23.4375V3.125Z" fill={color} />
    </svg>
  );
}

export function UserIconFilled({ size = 20, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size * (21.875 / 15.625)} viewBox="0 0 15.625 21.875" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M10.1562 12.5C11.6067 12.5 12.9978 13.076 14.0234 14.1016C15.049 15.1272 15.625 16.5183 15.625 17.9688V21.875H14.0625V17.9688C14.0625 17.4558 13.9619 16.9476 13.7656 16.4736C13.5693 15.9997 13.2807 15.5697 12.918 15.207C12.5553 14.8443 12.1253 14.5557 11.6514 14.3594C11.1774 14.1631 10.6692 14.0625 10.1562 14.0625H5.46875C4.43275 14.0625 3.4396 14.4745 2.70703 15.207C1.97447 15.9396 1.5625 16.9327 1.5625 17.9688V21.875H0V17.9688C0 16.5183 0.575973 15.1272 1.60156 14.1016C2.62715 13.076 4.01835 12.5 5.46875 12.5H10.1562ZM7.8125 0C9.2629 0 10.6541 0.575974 11.6797 1.60156C12.7053 2.62715 13.2812 4.01835 13.2812 5.46875C13.2812 6.55036 12.9603 7.60751 12.3594 8.50684C11.7585 9.40617 10.9046 10.1076 9.90527 10.5215C8.90602 10.9354 7.80591 11.043 6.74512 10.832C5.68449 10.6209 4.71 10.1006 3.94531 9.33594C3.18062 8.57125 2.6603 7.59676 2.44922 6.53613C2.23821 5.47534 2.34589 4.37523 2.75977 3.37598C3.17368 2.37669 3.87508 1.52279 4.77441 0.921875C5.67374 0.320972 6.73089 4.41867e-07 7.8125 0ZM7.8125 1.5625C6.7765 1.5625 5.78334 1.97447 5.05078 2.70703C4.31822 3.4396 3.90625 4.43275 3.90625 5.46875C3.90625 6.24123 4.13533 6.99635 4.56445 7.63867C4.99367 8.28103 5.60363 8.78247 6.31738 9.07812C7.03106 9.37374 7.81658 9.45044 8.57422 9.2998C9.33196 9.14908 10.0279 8.77677 10.5742 8.23047C11.1205 7.68417 11.4928 6.98821 11.6436 6.23047C11.7942 5.47283 11.7175 4.68731 11.4219 3.97363C11.1262 3.25988 10.6248 2.64992 9.98242 2.2207C9.3401 1.79158 8.58498 1.5625 7.8125 1.5625Z" fill={color} />
    </svg>
  );
}

export function MailNewIconFilled({ size = 22, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size * (17.1875 / 21.875)} viewBox="0 0 21.875 17.1875" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M18.75 10.9375C20.4759 10.9375 21.875 12.3366 21.875 14.0625C21.875 15.7884 20.4759 17.1875 18.75 17.1875C17.0241 17.1875 15.625 15.7884 15.625 14.0625C15.625 12.3366 17.0241 10.9375 18.75 10.9375ZM20.3125 0C20.7267 0.00055808 21.1241 0.165103 21.417 0.458008C21.7099 0.750913 21.8744 1.14827 21.875 1.5625V9.375H20.3125V2.27246L11.3818 8.45508C11.2512 8.54532 11.0963 8.59375 10.9375 8.59375C10.7787 8.59375 10.6238 8.54532 10.4932 8.45508L1.55957 2.27051L1.5625 14.0625H13.2812V15.625H1.5625C1.14827 15.6244 0.750913 15.4599 0.458008 15.167C0.165103 14.8741 0.00055808 14.4767 0 14.0625V1.5625C0.000475573 1.14825 0.165085 0.75093 0.458008 0.458008C0.75093 0.165085 1.14825 0.000475573 1.5625 0H20.3125ZM3.28223 1.5625L10.9375 6.8623L18.5928 1.5625H3.28223Z" fill={color} />
    </svg>
  );
}

export function MailAllIconFilled({ size = 22, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size * (18.75 / 21.875)} viewBox="0 0 21.875 18.75" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M16.4062 14.8438L12.5 18.75L11.3906 17.6484L14.1953 14.8438L11.3984 12.0391L12.5 10.9375L16.4062 14.8438ZM21.875 14.8438L17.9688 18.75L16.8594 17.6484L19.6641 14.8438L16.8672 12.0391L17.9688 10.9375L21.875 14.8438ZM20.3125 0C20.7269 0 21.124 0.164982 21.417 0.458008C21.71 0.751033 21.875 1.1481 21.875 1.5625V9.375H20.3125V2.27344L11.3828 8.45312C11.252 8.54385 11.0967 8.59277 10.9375 8.59277C10.7783 8.59277 10.623 8.54385 10.4922 8.45312L1.5625 2.27344V14.0625H9.375V15.625H1.5625C1.1481 15.625 0.751033 15.46 0.458008 15.167C0.164982 14.874 0 14.4769 0 14.0625V1.5625C0 1.1481 0.164982 0.751033 0.458008 0.458008C0.751033 0.164982 1.1481 0 1.5625 0H20.3125ZM3.28125 1.5625L10.9375 6.85938L18.5938 1.5625H3.28125Z" fill={color} />
    </svg>
  );
}

export function MailReplyIconFilled({ size = 22, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size * (20.3125 / 21.875)} viewBox="0 0 21.875 20.3125" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M21.875 14.8438L17.9688 18.75L16.8633 17.6465L18.8809 15.625H12.5C12.0856 15.625 11.6885 15.79 11.3955 16.083C11.1025 16.376 10.9375 16.7731 10.9375 17.1875C10.9375 17.6019 11.1025 17.999 11.3955 18.292C11.6885 18.585 12.0856 18.75 12.5 18.75H14.0625V20.3125H12.5C11.6712 20.3125 10.8761 19.9835 10.29 19.3975C9.70399 18.8114 9.375 18.0163 9.375 17.1875C9.375 16.3587 9.70399 15.5636 10.29 14.9775C10.8761 14.3915 11.6712 14.0625 12.5 14.0625H18.8809L16.8643 12.042L17.9688 10.9375L21.875 14.8438ZM20.3125 0C20.7267 0.000516834 21.1241 0.165094 21.417 0.458008C21.7099 0.750921 21.8745 1.14826 21.875 1.5625V9.375H20.3125V2.27246L11.3818 8.45508C11.2512 8.54532 11.0963 8.59375 10.9375 8.59375C10.7787 8.59375 10.6238 8.54532 10.4932 8.45508L1.55957 2.27051L1.5625 14.0625H6.25V15.625H1.5625C1.14826 15.6245 0.750917 15.4599 0.458008 15.167C0.165099 14.8741 0.000537459 14.4767 0 14.0625V1.55957C0.00077591 1.14571 0.166083 0.74942 0.458984 0.457031C0.75193 0.164603 1.14858 -6.33816e-07 1.5625 0H20.3125ZM3.28223 1.5625L10.9375 6.8623L18.5928 1.5625H3.28223Z" fill={color} />
    </svg>
  );
}

export function ImagePlaceholderIconFilled({ size = 75, color = "#B2B2B2", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 75 75" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M68.75 0C70.4076 0 71.9968 0.658952 73.1689 1.83105C74.341 3.00316 75 4.5924 75 6.25V68.75C75 70.4076 74.341 71.9968 73.1689 73.1689C71.9968 74.341 70.4076 75 68.75 75H6.25C4.5924 75 3.00316 74.341 1.83105 73.1689C0.658952 71.9968 0 70.4076 0 68.75V6.25C0 4.5924 0.658952 3.00316 1.83105 1.83105C3.00316 0.658952 4.5924 0 6.25 0H68.75ZM6.25 50V68.75H68.75V62.5L53.125 46.875L48.1562 51.8438C46.9852 53.0078 45.4012 53.6611 43.75 53.6611C42.0988 53.6611 40.5148 53.0078 39.3438 51.8438L21.875 34.375L6.25 50ZM6.25 6.25V41.1562L17.4688 29.9375C18.6398 28.7734 20.2238 28.1201 21.875 28.1201C23.5262 28.1201 25.1102 28.7734 26.2812 29.9375L43.75 47.4062L48.7188 42.4375C49.8898 41.2734 51.4738 40.6201 53.125 40.6201C54.7762 40.6201 56.3602 41.2734 57.5312 42.4375L68.75 53.6562V6.25H6.25ZM43.2871 13.2139C45.0002 12.5043 46.8855 12.318 48.7041 12.6797C50.5227 13.0414 52.1928 13.935 53.5039 15.2461C54.815 16.5572 55.7086 18.2273 56.0703 20.0459C56.432 21.8645 56.2457 23.7498 55.5361 25.4629C54.8265 27.1758 53.6246 28.6398 52.083 29.6699C50.5414 30.6999 48.7291 31.25 46.875 31.25C44.3886 31.25 42.0042 30.2621 40.2461 28.5039C38.4879 26.7458 37.5 24.3614 37.5 21.875C37.5 20.0209 38.0501 18.2086 39.0801 16.667C40.1102 15.1254 41.5742 13.9235 43.2871 13.2139ZM46.875 18.75C46.0462 18.75 45.2511 19.079 44.665 19.665C44.079 20.2511 43.75 21.0462 43.75 21.875C43.75 22.4931 43.933 23.0974 44.2764 23.6113C44.6196 24.1251 45.1079 24.5252 45.6787 24.7617C46.2496 24.9982 46.8783 25.0609 47.4844 24.9404C48.0906 24.8199 48.6479 24.522 49.085 24.085C49.522 23.6479 49.8199 23.0906 49.9404 22.4844C50.0609 21.8783 49.9982 21.2496 49.7617 20.6787C49.5252 20.1079 49.1251 19.6196 48.6113 19.2764C48.0974 18.933 47.4931 18.75 46.875 18.75Z" fill={color} />
    </svg>
  );
}

export function StepperAddIconFilled({ size = 18, color = "#717171", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18.5 18.5" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M10.4062 8.09375V0H8.09375V8.09375H0V10.4062H8.09375V18.5H10.4062V10.4062H18.5V8.09375H10.4062Z" fill={color} />
    </svg>
  );
}

export function StepperSubtractIconFilled({ size = 18, color = "#717171", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size * (2.3125 / 18.5)} viewBox="0 0 18.5 2.3125" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M18.5 0H0V2.3125H18.5V0Z" fill={color} />
    </svg>
  );
}

export function DownloadIconFilled({ size = 20, color = "#616161", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size * (30.625 / 26.25)} viewBox="0 0 26.25 30.625" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M2.1875 24.0625V28.4375H24.0625V24.0625H26.25V28.4375C26.25 29.0177 26.0196 29.5741 25.6094 29.9844C25.1991 30.3946 24.6427 30.625 24.0625 30.625H2.1875C1.60734 30.625 1.05086 30.3946 0.640625 29.9844C0.230389 29.5741 0 29.0177 0 28.4375V24.0625H2.1875ZM14.2188 0V19.873L22.5205 11.583L24.0625 13.125L13.125 24.0625L2.1875 13.125L3.72949 11.583L12.0312 19.873V0H14.2188Z" fill={color} />
    </svg>
  );
}

export function SaveIconFilled({ size = 20, color = "#4A4D51", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M21.6484 7.25783L17.7422 3.35158C17.6692 3.27917 17.5826 3.22188 17.4874 3.183C17.3922 3.14413 17.2903 3.12442 17.1875 3.12501H4.6875C4.2731 3.12501 3.87567 3.28963 3.58265 3.58266C3.28962 3.87568 3.125 4.27311 3.125 4.68751V20.3125C3.125 20.7269 3.28962 21.1243 3.58265 21.4174C3.87567 21.7104 4.2731 21.875 4.6875 21.875H20.3125C20.7269 21.875 21.1243 21.7104 21.4174 21.4174C21.7104 21.1243 21.875 20.7269 21.875 20.3125V7.81251C21.8756 7.7097 21.8559 7.60777 21.817 7.51259C21.7781 7.4174 21.7208 7.33083 21.6484 7.25783ZM9.375 4.68751H15.625V7.81251H9.375V4.68751ZM15.625 20.3125H9.375V14.0625H15.625V20.3125ZM17.1875 20.3125V14.0625C17.1875 13.6481 17.0229 13.2507 16.7299 12.9577C16.4368 12.6646 16.0394 12.5 15.625 12.5H9.375C8.9606 12.5 8.56317 12.6646 8.27015 12.9577C7.97712 13.2507 7.8125 13.6481 7.8125 14.0625V20.3125H4.6875V4.68751H7.8125V7.81251C7.8125 8.22691 7.97712 8.62434 8.27015 8.91737C8.56317 9.21039 8.9606 9.37501 9.375 9.37501H15.625C16.0394 9.37501 16.4368 9.21039 16.7299 8.91737C17.0229 8.62434 17.1875 8.22691 17.1875 7.81251V5.00783L20.3125 8.13283V20.3125H17.1875Z"
        fill={color}
      />
    </svg>
  );
}

export function TrashCanIconFilled({ size = 20, color = "#454545", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M21.875 6.25H20.3125V21.875C20.3125 22.2894 20.1475 22.6865 19.8545 22.9795C19.5615 23.2725 19.1644 23.4375 18.75 23.4375H6.25C5.8356 23.4375 5.43853 23.2725 5.14551 22.9795C4.85248 22.6865 4.6875 22.2894 4.6875 21.875V6.25H3.125V4.6875H21.875V6.25ZM6.25 21.875H18.75V6.25H6.25V21.875ZM10.9375 18.75H9.375V9.375H10.9375V18.75ZM15.625 18.75H14.0625V9.375H15.625V18.75ZM15.625 1.5625V3.125H9.375V1.5625H15.625Z"
        fill={color}
      />
    </svg>
  );
}

export function TrashIconFilled({ size = 20, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M9 3.5a1 1 0 011-1h4a1 1 0 011 1V5h4.5a.75.75 0 010 1.5H4.5a.75.75 0 010-1.5H9V3.5z"
        fill={color}
      />
      <path
        d="M5.66 8h12.68l-.82 11.44A2.25 2.25 0 0115.29 21.5H8.71a2.25 2.25 0 01-2.24-2.06L5.66 8zm4.09 2.75a.75.75 0 00-.75.75v6.5a.75.75 0 001.5 0v-6.5a.75.75 0 00-.75-.75zm4.5 0a.75.75 0 00-.75.75v6.5a.75.75 0 001.5 0v-6.5a.75.75 0 00-.75-.75z"
        fill={color}
      />
    </svg>
  );
}

export function CheckmarkCircleIconFilled({ size = 124, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 124.25 124.25" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M62.125 0C49.8379 0 37.8266 3.64357 27.6102 10.47C17.3938 17.2963 9.43111 26.9989 4.72901 38.3508C0.0269178 49.7027 -1.20336 62.1939 1.19374 74.245C3.59085 86.2961 9.50768 97.3657 18.196 106.054C26.8844 114.742 37.954 120.659 50.005 123.056C62.0561 125.453 74.5474 124.223 85.8992 119.521C97.2511 114.819 106.954 106.856 113.78 96.6398C120.606 86.4234 124.25 74.4122 124.25 62.125C124.25 45.6484 117.705 29.8467 106.054 18.196C94.4033 6.54529 78.6016 0 62.125 0V0ZM53.25 86.9342L31.0625 64.7467L38.1208 57.6875L53.25 72.8158L86.1319 39.9375L93.2128 46.9749L53.25 86.9342Z" fill="#2BC217" />
    </svg>
  );
}
