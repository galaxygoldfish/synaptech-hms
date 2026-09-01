import type { ReactElement } from "react";
import type { MemberIconKey } from "./types";

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

export function PersonIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
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

export function CloseIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M6 6l12 12M18 6L6 18" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MailIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke={stroke} strokeWidth="1.6" />
      <path d="M4.5 7l7.5 5.5L19.5 7" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PinIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
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

export function HandleIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
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

export function CheckmarkIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M5 12.5l4.5 4.5L19 7" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DocumentationIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="3.5" y="4.5" width="17" height="10" rx="1.5" stroke={stroke} strokeWidth="1.6" />
      <path d="M8 19h8M12 14.5V19" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16.5" cy="9.5" r="1.4" stroke={stroke} strokeWidth="1.3" />
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

export function DownloadIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 17.5v2A2.5 2.5 0 007 22h10a2.5 2.5 0 002.5-2.5v-2" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloudUploadIcon({ size = 26, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M12 13v8" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 17l4-4 4 4" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DocumentIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 9h1M16 13H8M16 17H8" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M3 6h18" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
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

// ── Filled Home-page icon set (matches Figma wireframe exactly) ──────────

export function UserIconFilled({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size * (27.125 / 19.375)} viewBox="0 0 19.375 27.125" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M12.5938 15.5C14.3922 15.5 16.1169 16.2146 17.3887 17.4863C18.6604 18.7581 19.375 20.4828 19.375 22.2812V27.125H17.4375V22.2812C17.4375 21.6452 17.3118 21.0154 17.0684 20.4277C16.8249 19.8401 16.4683 19.3062 16.0186 18.8564C15.5688 18.4067 15.0349 18.0501 14.4473 17.8066C13.8596 17.5632 13.2298 17.4375 12.5938 17.4375H6.78125C5.49661 17.4375 4.26482 17.9481 3.35645 18.8564C2.44807 19.7648 1.9375 20.9966 1.9375 22.2812V27.125H0V22.2812C0 20.4828 0.714597 18.7581 1.98633 17.4863C3.25806 16.2146 4.98275 15.5 6.78125 15.5H12.5938ZM9.6875 0C11.486 0 13.2107 0.714598 14.4824 1.98633C15.7542 3.25806 16.4688 4.98275 16.4688 6.78125C16.4687 8.12244 16.0713 9.43367 15.3262 10.5488C14.581 11.664 13.5213 12.5326 12.2822 13.0459C11.0432 13.5591 9.67964 13.6943 8.36426 13.4326C7.0489 13.1709 5.84091 12.5245 4.89258 11.5762C3.94425 10.6278 3.29781 9.41985 3.03613 8.10449C2.77449 6.78911 2.90965 5.42559 3.42285 4.18652C3.93611 2.94741 4.80475 1.88771 5.91992 1.14258C7.03508 0.397463 8.34631 4.65432e-07 9.6875 0ZM9.6875 1.9375C8.40286 1.9375 7.17107 2.44807 6.2627 3.35645C5.35432 4.26482 4.84375 5.49661 4.84375 6.78125C4.84375 7.73925 5.12792 8.67611 5.66016 9.47266C6.19237 10.269 6.94904 10.8893 7.83398 11.2559C8.71906 11.6225 9.69322 11.7191 10.6328 11.5322C11.5723 11.3453 12.435 10.8834 13.1123 10.2061C13.7896 9.52871 14.2515 8.66605 14.4385 7.72656C14.6254 6.78697 14.5287 5.81281 14.1621 4.92773C13.7955 4.04279 13.1753 3.28612 12.3789 2.75391C11.5824 2.22167 10.6455 1.9375 9.6875 1.9375Z" fill="currentColor" />
    </svg>
  )
}

export function PlusIconFilled({ size = 54, color = "#536A8A", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 54.5 54.5" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M30.6562 23.8438V0H23.8438V23.8438H0V30.6562H23.8438V54.5H30.6562V30.6562H54.5V23.8438H30.6562Z" fill={color} />
    </svg>
  )
}

export function ChevronRightFilled({ size = 9, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size * (15.625 / 8.90625)} viewBox="0 0 8.90625 15.625" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M8.90625 7.8125L1.09375 15.625L0 14.5313L6.71875 7.8125L0 1.09375L1.09375 0L8.90625 7.8125Z" fill={color} />
    </svg>
  )
}

export function BrowseIconFilled({ size = 22, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21.875 21.875" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M7.8125 17.1875H1.5625V20.3125H7.8125V21.875H1.5625C1.14825 21.8745 0.75093 21.7099 0.458008 21.417C0.165085 21.1241 0.000475573 20.7268 0 20.3125V17.1875C0.000475573 16.7732 0.165085 16.3759 0.458008 16.083C0.75093 15.7901 1.14825 15.6255 1.5625 15.625H7.8125V17.1875ZM15.625 12.5C16.9454 12.5406 18.2247 12.9678 19.3047 13.7285C20.3847 14.4893 21.2184 15.5506 21.7012 16.7803L21.875 17.1875L21.7012 17.5947C21.2184 18.8244 20.3847 19.8857 19.3047 20.6465C18.2247 21.4072 16.9454 21.8344 15.625 21.875C14.3046 21.8344 13.0253 21.4072 11.9453 20.6465C10.8653 19.8857 10.0316 18.8244 9.54883 17.5947L9.375 17.1875L9.54883 16.7803C10.0316 15.5506 10.8653 14.4893 11.9453 13.7285C13.0253 12.9678 14.3046 12.5406 15.625 12.5ZM16.8213 14.3008C16.2504 14.0643 15.6217 14.0016 15.0156 14.1221C14.4094 14.2426 13.8521 14.5405 13.415 14.9775C12.978 15.4146 12.6801 15.9719 12.5596 16.5781C12.4391 17.1842 12.5018 17.8129 12.7383 18.3838C12.9748 18.9546 13.3749 19.4429 13.8887 19.7861C14.4026 20.1295 15.0069 20.3125 15.625 20.3125C16.4535 20.3116 17.2481 19.9823 17.834 19.3965C18.4198 18.8106 18.7491 18.016 18.75 17.1875C18.75 16.5694 18.567 15.9651 18.2236 15.4512C17.8804 14.9374 17.3921 14.5373 16.8213 14.3008ZM15.625 15.5371C16.4879 15.5371 17.1875 16.2367 17.1875 17.0996C17.1874 17.9624 16.4879 18.6621 15.625 18.6621C14.7621 18.6621 14.0626 17.9624 14.0625 17.0996C14.0625 16.2367 14.7621 15.5371 15.625 15.5371ZM20.3125 7.8125C20.7268 7.81298 21.1241 7.97759 21.417 8.27051C21.7099 8.56343 21.8745 8.96075 21.875 9.375V10.9375H20.3135L20.3125 9.375H3.90625V12.5H7.8125V14.0625H3.90625C3.492 14.062 3.09468 13.8974 2.80176 13.6045C2.50884 13.3116 2.34423 12.9143 2.34375 12.5V9.375C2.34423 8.96075 2.50884 8.56343 2.80176 8.27051C3.09468 7.97759 3.492 7.81298 3.90625 7.8125H20.3125ZM17.9688 0C18.383 0.000434297 18.7803 0.165076 19.0732 0.458008C19.3662 0.750939 19.5308 1.14823 19.5312 1.5625V4.6875C19.5308 5.10177 19.3662 5.49906 19.0732 5.79199C18.7803 6.08492 18.383 6.24957 17.9688 6.25H1.5625C1.14823 6.24957 0.750939 6.08492 0.458008 5.79199C0.165076 5.49906 0.000434297 5.10177 0 4.6875V1.5625C0.000434297 1.14823 0.165076 0.750939 0.458008 0.458008C0.750939 0.165076 1.14823 0.000434297 1.5625 0H17.9688ZM1.5625 4.6875H17.9688V1.5625H1.5625V4.6875Z" fill={color} />
    </svg>
  )
}

export function TimeIconFilled({ size = 22, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21.8753 21.8753" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M8.80397 0.210222C10.9256 -0.211765 13.1248 0.00451986 15.1233 0.832292C17.1219 1.66013 18.8297 3.06293 20.0315 4.86159C21.2333 6.66022 21.8753 8.77459 21.8753 10.9378C21.8752 13.8385 20.7233 16.621 18.6721 18.6721C16.621 20.7233 13.8385 21.8752 10.9378 21.8753C8.77459 21.8753 6.66022 21.2333 4.86159 20.0315C3.06293 18.8297 1.66013 17.1219 0.832292 15.1233C0.00451998 13.1248 -0.211765 10.9256 0.210222 8.80397C0.632248 6.6823 1.67375 4.73302 3.20339 3.20339C4.73302 1.67375 6.6823 0.632248 8.80397 0.210222ZM10.9378 1.56276C9.08356 1.56276 7.27049 2.1127 5.72878 3.14284C4.18732 4.17291 2.98615 5.63706 2.27663 7.34987C1.56706 9.06293 1.38071 10.9483 1.74245 12.7669C2.1042 14.5854 2.99777 16.2556 4.30885 17.5667C5.61993 18.8777 7.29018 19.7704 9.10866 20.1321C10.9272 20.4938 12.8126 20.3085 14.5257 19.5989C16.2386 18.8893 17.7026 17.6874 18.7327 16.1458C19.7627 14.6041 20.3127 12.7918 20.3128 10.9378C20.3128 8.45139 19.3248 6.067 17.5667 4.30885C15.8085 2.55072 13.4241 1.56278 10.9378 1.56276ZM11.719 10.6096L15.6253 14.5237L14.5237 15.6253L10.1565 11.2581V3.90651H11.719V10.6096Z" fill={color} />
    </svg>
  )
}

export function PlusIconSmallFilled({ size = 15, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M8.4375 6.5625V0H6.5625V6.5625H0V8.4375H6.5625V15H8.4375V8.4375H15V6.5625H8.4375Z" fill={color} />
    </svg>
  )
}

export function HelpIconFilled({ size = 22, color = "#474747", className }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21.8753 21.875" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M10.9378 0C13.8385 1.35833e-05 16.621 1.15196 18.6721 3.20312C20.7233 5.2543 21.8753 8.03671 21.8753 10.9375C21.8753 13.1007 21.2333 15.215 20.0315 17.0137C18.8297 18.8123 17.1218 20.2142 15.1233 21.042C13.1248 21.8698 10.9256 22.087 8.80397 21.665C6.68232 21.243 4.73302 20.2015 3.20339 18.6719C1.67375 17.1422 0.63225 15.193 0.210224 13.0713C-0.211776 10.9497 0.00453991 8.75045 0.832294 6.75195C1.66013 4.75339 3.06293 3.04558 4.86159 1.84375C6.66023 0.641961 8.77457 0 10.9378 0ZM14.5257 2.27637C12.8126 1.5668 10.9272 1.38045 9.10866 1.74219C7.2901 2.10392 5.61997 2.99749 4.30886 4.30859C2.99775 5.6197 2.10419 7.28985 1.74245 9.1084C1.38071 10.927 1.56706 12.8123 2.27663 14.5254C2.98616 16.2382 4.18733 17.7024 5.72878 18.7324C7.27049 19.7626 9.08356 20.3125 10.9378 20.3125C13.4241 20.3125 15.8085 19.3245 17.5667 17.5664C19.3248 15.8083 20.3128 13.4239 20.3128 10.9375C20.3128 9.08342 19.7627 7.27114 18.7327 5.72949C17.7026 4.18788 16.2386 2.98596 14.5257 2.27637ZM10.9378 15.625C11.5849 15.625 12.1096 16.1497 12.1096 16.7969C12.1096 17.4441 11.5849 17.9687 10.9378 17.9688C10.2906 17.9688 9.76589 17.4441 9.76589 16.7969C9.76589 16.1497 10.2906 15.625 10.9378 15.625ZM11.719 4.6875C12.6514 4.68751 13.546 5.0575 14.2053 5.7168C14.8646 6.3761 15.2346 7.27074 15.2346 8.20312C15.2346 9.13551 14.8646 10.0301 14.2053 10.6895C13.546 11.3487 12.6514 11.7187 11.719 11.7188V13.6719H10.1565V10.1562H11.719C12.237 10.1562 12.7336 9.95025 13.0999 9.58398C13.4661 9.21771 13.6721 8.72111 13.6721 8.20312C13.6721 7.68514 13.4661 7.18854 13.0999 6.82227C12.7336 6.456 12.237 6.25001 11.719 6.25H10.5471C10.0292 6.25 9.53256 6.456 9.16628 6.82227C8.8 7.18855 8.59402 7.68513 8.59401 8.20312V8.59375H7.03151V8.20312C7.03048 7.74116 7.12083 7.28344 7.29714 6.85645C7.47345 6.4295 7.73223 6.04147 8.05886 5.71484C8.38549 5.38821 8.7735 5.12943 9.20046 4.95312C9.62746 4.77681 10.0852 4.68647 10.5471 4.6875H11.719Z" fill={color} />
    </svg>
  )
}

export function CognitiveBrainIconFilled({ size = 100, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 126.875 126.875" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M126.875 49.8438C126.875 43.2982 125.586 36.8167 123.081 30.7694C120.576 24.7221 116.905 19.2273 112.276 14.5989C107.648 9.97048 102.153 6.29901 96.1056 3.79413C90.0583 1.28925 83.5768 0 77.0312 0H40.7812C29.9654 0 19.5925 4.29658 11.9446 11.9446C4.29658 19.5925 0 29.9654 0 40.7812V54.375C0 60.3838 2.38699 66.1465 6.63586 70.3954C10.8847 74.6443 16.6474 77.0313 22.6562 77.0312H27.6406C28.6852 82.1487 31.4658 86.748 35.5118 90.0509C39.5579 93.3538 44.6208 95.1573 49.8438 95.1562H56.0969L74.2219 126.875L82.0609 122.344L63.9359 91.1234C63.2068 89.6541 62.0925 88.4103 60.712 87.5245C59.3314 86.6387 57.7364 86.1442 56.0969 86.0938H49.8438C46.2385 86.0937 42.7808 84.6616 40.2315 82.1122C37.6822 79.5629 36.25 76.1053 36.25 72.5C36.25 68.8947 37.6822 65.4371 40.2315 62.8878C42.7808 60.3384 46.2385 58.9063 49.8438 58.9062H54.375V49.8438H49.8438C44.6208 49.8427 39.5579 51.6462 35.5118 54.9491C31.4658 58.252 28.6852 62.8513 27.6406 67.9688H22.6562C19.051 67.9687 15.5933 66.5366 13.044 63.9872C10.4947 61.4379 9.0625 57.9803 9.0625 54.375V45.3125H18.125C21.7303 45.3125 25.1879 43.8803 27.7372 41.331C30.2866 38.7817 31.7188 35.324 31.7188 31.7188V27.1875H22.6562V31.7188C22.6562 32.9205 22.1789 34.0731 21.3291 34.9228C20.4793 35.7726 19.3268 36.25 18.125 36.25H9.425C10.5137 28.7073 14.2817 21.8087 20.0396 16.8163C25.7975 11.8239 33.1604 9.07143 40.7812 9.0625H67.9688V18.125C67.9688 19.3268 67.4914 20.4793 66.6416 21.3291C65.7918 22.1789 64.6393 22.6562 63.4375 22.6562H54.375V31.7188H63.4375C67.0428 31.7188 70.5004 30.2866 73.0497 27.7372C75.5991 25.1879 77.0312 21.7303 77.0312 18.125V9.0625C84.6168 9.07283 92.0492 11.1986 98.4929 15.201C104.937 19.2033 110.136 24.9235 113.508 31.7188H108.75C105.145 31.7188 101.687 33.1509 99.1378 35.7003C96.5884 38.2496 95.1563 41.7072 95.1562 45.3125V49.8438H104.219V45.3125C104.219 44.1107 104.696 42.9582 105.546 42.1084C106.396 41.2586 107.548 40.7812 108.75 40.7812H116.77C117.465 43.752 117.815 46.7929 117.812 49.8438V54.375C117.813 60.3838 115.426 66.1465 111.177 70.3954C106.928 74.6443 101.165 77.0313 95.1562 77.0312H81.5625V86.0938H95.1562C99.8599 86.0873 104.503 85.0348 108.75 83.0125V86.0938C108.75 89.699 107.318 93.1567 104.768 95.706C102.219 98.2553 98.7615 99.6875 95.1562 99.6875H90.625V108.75H95.1562C101.165 108.75 106.928 106.363 111.177 102.114C115.426 97.8653 117.812 92.1026 117.812 86.0938V76.5328C123.612 70.6141 126.864 62.6611 126.875 54.375V49.8438Z" fill="black" />
    </svg>
  )
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
