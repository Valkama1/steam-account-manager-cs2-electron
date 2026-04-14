import styles from "../App.module.css";

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

export function PremierIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
      <polygon points="8,0 9.5,5.5 15,5.5 10.5,9 12,15 8,11.5 4,15 5.5,9 1,5.5 6.5,5.5"
        fill="#4db6e8" />
    </svg>
  );
}
