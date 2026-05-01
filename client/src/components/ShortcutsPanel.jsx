import { useState, useEffect } from "react";
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, rectSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "../App.module.css";
import { CloseIcon, EditIcon, DeleteIcon, FolderIcon, PlusIcon, LaunchIcon } from "./icons.jsx";
import ModalShell from "./ModalShell.jsx";

function ShortcutTile({ shortcut, icon, onEdit, onDelete, onLaunch, launching }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: shortcut.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${styles.shortcutTile} ${isDragging ? styles.shortcutTileDragging : ""}`}
      onClick={() => onLaunch(shortcut.id)}
      title={`Launch ${shortcut.name}`}
      {...attributes}
      {...listeners}
    >
      <div className={styles.shortcutTileHoverActions}>
        <button
          className={styles.shortcutTileAction}
          onClick={e => { e.stopPropagation(); onEdit(shortcut); }}
          title="Edit"
        ><EditIcon size={11} /></button>
        <button
          className={styles.shortcutTileAction}
          onClick={e => { e.stopPropagation(); onDelete(shortcut.id); }}
          title="Delete"
        ><DeleteIcon size={11} /></button>
      </div>
      <div className={styles.shortcutTileIconWrap}>
        {icon
          ? <img src={icon} alt="" className={styles.shortcutTileImg} draggable={false} />
          : <div className={styles.shortcutTileIconFallback}><LaunchIcon size={26} /></div>
        }
        {launching === shortcut.id && <div className={styles.shortcutTileLaunching} />}
      </div>
      <span className={styles.shortcutTileName}>{shortcut.name}</span>
    </div>
  );
}

function TileOverlay({ shortcut, icon }) {
  return (
    <div className={`${styles.shortcutTile} ${styles.shortcutTileDragOverlay}`}>
      <div className={styles.shortcutTileIconWrap}>
        {icon
          ? <img src={icon} alt="" className={styles.shortcutTileImg} draggable={false} />
          : <div className={styles.shortcutTileIconFallback}><LaunchIcon size={26} /></div>
        }
      </div>
      <span className={styles.shortcutTileName}>{shortcut.name}</span>
    </div>
  );
}

export default function ShortcutsPanel({ shortcuts, onClose, onAdd, onEdit, onDelete, onLaunch, onReorder }) {
  const [formMode, setFormMode] = useState(null); // null | "add" | { id, path }
  const [name, setName]       = useState("");
  const [exePath, setExePath] = useState("");
  const [args, setArgs]       = useState("");
  const [error, setError]     = useState(null);
  const [saving, setSaving]   = useState(false);
  const [launching, setLaunching] = useState(null);
  const [icons, setIcons]     = useState({});
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  // Fetch exe icons whenever shortcuts list changes
  useEffect(() => {
    if (!window.electronAPI?.getFileIcon) return;
    shortcuts.forEach(s => {
      window.electronAPI.getFileIcon(s.path)
        .then(dataUrl => { if (dataUrl) setIcons(prev => ({ ...prev, [s.id]: dataUrl })); })
        .catch(() => {});
    });
  }, [shortcuts]);

  function openAdd() {
    setFormMode("add");
    setName(""); setExePath(""); setArgs(""); setError(null);
  }

  function openEdit(s) {
    setFormMode({ id: s.id, path: s.path });
    setName(s.name); setExePath(s.path); setArgs(s.args || ""); setError(null);
  }

  function closeForm() {
    setFormMode(null);
    setName(""); setExePath(""); setArgs(""); setError(null);
  }

  async function handleSave() {
    const trimName = name.trim();
    const trimPath = exePath.trim();
    if (!trimName || !trimPath) { setError("Name and path are required"); return; }
    setSaving(true); setError(null);
    try {
      if (formMode === "add") {
        await onAdd({ name: trimName, path: trimPath, args: args.trim() });
      } else {
        await onEdit(formMode.id, { name: trimName, path: trimPath, args: args.trim() });
        if (formMode.path !== trimPath)
          setIcons(prev => { const n = { ...prev }; delete n[formMode.id]; return n; });
      }
      closeForm();
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  async function handleLaunch(id) {
    setLaunching(id);
    try { await onLaunch(id); } finally { setLaunching(null); }
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIdx = shortcuts.findIndex(s => s.id === active.id);
    const newIdx = shortcuts.findIndex(s => s.id === over.id);
    onReorder(arrayMove(shortcuts, oldIdx, newIdx));
  }

  const activeShortcut = activeId ? shortcuts.find(s => s.id === activeId) : null;

  return (
    <ModalShell onClose={onClose} className={styles.shortcutsModal}>
      {(close) => (<>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Shortcuts</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              className={styles.shortcutsToggleFormBtn}
              onClick={formMode ? closeForm : openAdd}
              title={formMode ? "Cancel" : "Add shortcut"}
            >{formMode ? <CloseIcon size={14} /> : <PlusIcon size={14} />}</button>
            <button className={styles.modalClose} onClick={close}><CloseIcon size={14} /></button>
          </div>
        </div>

        {formMode && (
          <div className={styles.shortcutsFormPanel}>
            <div className={styles.shortcutsFormGrid}>
              <input
                className={styles.watchlistInput}
                placeholder="Name (e.g. BO3 T7 Launcher)"
                value={name}
                onChange={e => { setName(e.target.value); setError(null); }}
                disabled={saving}
                autoFocus
              />
              <div className={styles.shortcutsPathRow}>
                <input
                  className={styles.watchlistInput}
                  placeholder="Executable path"
                  value={exePath}
                  onChange={e => { setExePath(e.target.value); setError(null); }}
                  disabled={saving}
                />
                {window.electronAPI?.openFile && (
                  <button
                    type="button"
                    className={styles.shortcutsBrowseBtn}
                    title="Browse"
                    disabled={saving}
                    onClick={async () => {
                      const picked = await window.electronAPI.openFile();
                      if (picked) { setExePath(picked); setError(null); }
                    }}
                  ><FolderIcon size={15} /></button>
                )}
              </div>
              <input
                className={styles.watchlistInput}
                placeholder="Arguments (optional)"
                value={args}
                onChange={e => setArgs(e.target.value)}
                disabled={saving}
              />
            </div>
            {error && <p className={styles.watchlistError} style={{ margin: 0 }}>{error}</p>}
            <button
              className={styles.watchlistAddBtn}
              style={{ borderRadius: 8, height: 40 }}
              onClick={handleSave}
              disabled={saving || !name.trim() || !exePath.trim()}
            >{saving ? "Saving…" : formMode === "add" ? "Add shortcut" : "Save changes"}</button>
          </div>
        )}

        <div className={styles.shortcutsGrid}>
          {shortcuts.length === 0 ? (
            <div className={styles.shortcutsEmpty}>
              <div className={styles.shortcutsEmptyIcon}><LaunchIcon size={32} /></div>
              <p>No shortcuts yet</p>
              <button className={styles.shortcutsEmptyAddBtn} onClick={openAdd}>
                <PlusIcon size={13} /> Add your first shortcut
              </button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={e => setActiveId(e.active.id)}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              <SortableContext items={shortcuts.map(s => s.id)} strategy={rectSortingStrategy}>
                <div className={styles.shortcutTileGrid}>
                  {shortcuts.map(s => (
                    <ShortcutTile
                      key={s.id}
                      shortcut={s}
                      icon={icons[s.id]}
                      onLaunch={handleLaunch}
                      onEdit={openEdit}
                      onDelete={onDelete}
                      launching={launching}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
                {activeShortcut
                  ? <TileOverlay shortcut={activeShortcut} icon={icons[activeShortcut.id]} />
                  : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </>)}
    </ModalShell>
  );
}
