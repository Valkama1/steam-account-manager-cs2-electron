import styles from "../App.module.css";

export default function Badge({ color, bg, children, title }) {
  return (
    <span title={title} style={{
      display: "inline-block", padding: "3px 10px", borderRadius: "4px",
      fontSize: "11px", fontFamily: "var(--mono)", fontWeight: 600,
      color, background: bg, letterSpacing: "0.05em"
    }}>{children}</span>
  );
}
