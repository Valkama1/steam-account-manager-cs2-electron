import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "../App.module.css";
import { ChevronDownIcon, ChevronRightIcon } from "./icons.jsx";
import { DragHandleIcon } from "./icons.jsx";

export default function Section({ id, title, accent, children, layout, count, collapsed, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    marginBottom: "2rem",
  };

  return (
    <section ref={setNodeRef} style={style}>
      <div className={styles.sectionHeaderRow}>
        <div className={styles.sectionDragHandle} title="Drag to reorder section" {...listeners} {...attributes}>
          <DragHandleIcon size={14} />
        </div>
        <button className={styles.sectionHeader} onClick={onToggle}>
          <h2 className={styles.sectionTitle} style={{ color: accent }}>
            {title}
            <span className={styles.sectionCount}>({count})</span>
          </h2>
          <span className={styles.sectionChevron} style={{ color: accent }}>{collapsed ? <ChevronRightIcon size={16} /> : <ChevronDownIcon size={16} />}</span>
        </button>
      </div>
      {!collapsed && <div className={layout === "list" ? styles.cardGridList : styles.cardGrid}>{children}</div>}
    </section>
  );
}
