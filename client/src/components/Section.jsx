import styles from "../App.module.css";

export default function Section({ title, accent, children, layout, count, collapsed, onToggle }) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <button className={styles.sectionHeader} onClick={onToggle}>
        <h2 className={styles.sectionTitle} style={{ color: accent }}>
          {title}
          <span className={styles.sectionCount}>({count})</span>
        </h2>
        <span className={styles.sectionChevron} style={{ color: accent }}>{collapsed ? "›" : "‹"}</span>
      </button>
      {!collapsed && <div className={layout === "list" ? styles.cardGridList : styles.cardGrid}>{children}</div>}
    </section>
  );
}
