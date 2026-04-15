/**
 * Google Material Icons — filled style, 24×24 viewBox, fill="currentColor"
 * All paths sourced from fonts.google.com/icons (Material Symbols / Icons, filled)
 */

const S = { display: "inline-block", verticalAlign: "middle", flexShrink: 0 };
const Icon = ({ size, children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ ...S, ...style }}>
    {children}
  </svg>
);

export function LeetifyIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" fill="none" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      <path fill="currentColor" fillOpacity="0.5" d="M61.8316 58.4014l7.2955-34.3824h81.9149c4.389 0 7.946 3.5635 7.946 7.9592 0 .5585-.059 1.1155-.175 1.6617l-20.021 93.9441c-1.044 4.897-5.363 8.397-10.361 8.397H95.7456l14.9964-69.8739c.738-3.4381-1.446-6.8243-4.878-7.5635a6.3497 6.3497 0 00-1.336-.1422z"/>
      <path fill="currentColor" d="M52.811 64.2425a8.107 8.107 0 00-.107.436l-5.9366 27.5032c-.6182 2.8643 1.1986 5.6883 4.0581 6.3076a5.286 5.286 0 001.1194.1199h18.7043c2.9255 0 5.2971 2.3756 5.2971 5.3061 0 .3735-.0394.746-.1174 1.1112l-6.6182 30.9545H8.9577c-4.3883 0-7.9457-3.564-7.9457-7.959a7.97 7.97 0 01.1751-1.662l20.0216-93.9444c1.0436-4.8966 5.3622-8.3966 10.3608-8.3966h29.7291z"/>
    </svg>
  );
}

export function CrosshairIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      <circle cx="12" cy="12" r="7" />
      <line x1="12" y1="2"  x2="12" y2="5"  />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2"  y1="12" x2="5"  y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── Navigation / UI chrome ────────────────────────────────────────────────────

export function CloseIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </Icon>
  );
}

export function ChevronLeftIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </Icon>
  );
}

export function ChevronRightIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </Icon>
  );
}

export function ChevronUpIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />
    </Icon>
  );
}

export function ChevronDownIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" />
    </Icon>
  );
}

// ── Actions ───────────────────────────────────────────────────────────────────

export function PlusIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </Icon>
  );
}

export function RefreshIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </Icon>
  );
}

export function EditIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </Icon>
  );
}

export function DeleteIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </Icon>
  );
}

export function CheckIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </Icon>
  );
}

export function SwitchIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z" />
    </Icon>
  );
}

export function CopyIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </Icon>
  );
}

export function DownloadIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
    </Icon>
  );
}

export function UploadIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
    </Icon>
  );
}

export function TimerIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
    </Icon>
  );
}

export function HistoryIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
    </Icon>
  );
}

export function StarIcon({ size = 16 }) {
  // outlined star
  return (
    <Icon size={size}>
      <path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z" />
    </Icon>
  );
}

export function StarFilledIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </Icon>
  );
}

// ── App-specific ──────────────────────────────────────────────────────────────

export function FlagIcon({ size = 16 }) {
  // Material "flag" filled
  return (
    <Icon size={size}>
      <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" />
    </Icon>
  );
}

export function SettingsIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </Icon>
  );
}

export function DragHandleIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <circle cx="9"  cy="6"  r="1.5" />
      <circle cx="9"  cy="12" r="1.5" />
      <circle cx="9"  cy="18" r="1.5" />
      <circle cx="15" cy="6"  r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </Icon>
  );
}

export function BellIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
    </Icon>
  );
}

export function NoteIcon({ size = 16 }) {
  return (
    <Icon size={size}>
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    </Icon>
  );
}

export function InfoIcon({ size = 14 }) {
  return (
    <Icon size={size}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </Icon>
  );
}

// ── Game-specific badges (custom, not Material) ───────────────────────────────

function premierTierColor(rating) {
  if (rating >= 30000) return "#f0c030";
  if (rating >= 25000) return "#eb4b4b";
  if (rating >= 20000) return "#d32ce6";
  if (rating >= 15000) return "#8847ff";
  if (rating >= 10000) return "#4b69ff";
  if (rating >= 5000)  return "#5e98d9";
  return "#b0c3d9";
}

function premierTierDarkBg(rating) {
  if (rating >= 30000) return "#1a1400";
  if (rating >= 25000) return "#1a0505";
  if (rating >= 20000) return "#160520";
  if (rating >= 15000) return "#0d0520";
  if (rating >= 10000) return "#05051a";
  if (rating >= 5000)  return "#051018";
  return "#0d1015";
}

export function PrimeIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <polygon points="8,1 10.2,6 15.5,6.5 11.5,10 12.8,15.5 8,12.5 3.2,15.5 4.5,10 0.5,6.5 5.8,6"
        fill="#e8b53a" />
    </svg>
  );
}

export function PremierIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <polygon points="8,0 9.5,5.5 15,5.5 10.5,9 12,15 8,11.5 4,15 5.5,9 1,5.5 6.5,5.5"
        fill="#4db6e8" />
    </svg>
  );
}

export function PremierRatingBadge({ rating }) {
  const color = premierTierColor(rating);
  const bg    = premierTierDarkBg(rating);
  const main  = rating >= 1000
    ? `${Math.floor(rating / 1000).toLocaleString()},`
    : String(rating);
  const sub   = rating >= 1000
    ? String(rating % 1000).padStart(3, "0")
    : null;
  return (
    <div style={{ position: "relative", display: "inline-flex", height: 22, aspectRatio: "110/40", flexShrink: 0 }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
           viewBox="0 0 125 40" fill="none" preserveAspectRatio="none">
        <path d="M10.5449 1H118.411C121.468 1.0002 123.809 3.71928 123.355 6.74219L119.155 34.7422C118.788 37.1895 116.686 38.9999 114.211 39H6.34473C3.28805 38.9998 0.946954 36.2807 1.40039 33.2578L5.60059 5.25781C5.96793 2.81051 8.07017 1.00006 10.5449 1Z"
              fill={bg} stroke={color} strokeWidth="2"/>
        <path d="M4.84496 3.40663C5.13867 1.44855 6.82072 0 8.80071 0H13.356L7.35596 40H4.00071C1.55523 40 -0.317801 37.8251 0.0449613 35.4066L4.84496 3.40663Z"
              fill={color}/>
        <path d="M17.2617 0H26.2617L20.2617 40H11.2617L17.2617 0Z" fill={color}/>
      </svg>
      <div style={{ position: "relative", display: "flex", flex: 1, alignItems: "center", justifyContent: "center", paddingLeft: "18%" }}>
        <div style={{ display: "flex", alignItems: "baseline", fontStyle: "italic", lineHeight: 1 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "var(--mono)" }}>{main}</span>
          {sub && <span style={{ fontSize: 8, fontWeight: 700, color, fontFamily: "var(--mono)" }}>{sub}</span>}
        </div>
      </div>
    </div>
  );
}
