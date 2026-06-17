/**
 * NORTE UI components — ported from the original project's src/components/ui/index.tsx
 */
import React from "react";
import { LEVEL_LABELS, STATUS_META, DAY_NAMES, type ChipColor } from "../../lib/domain";

// ── Avatar ────────────────────────────────────────────────────────────────────

interface AvatarProps {
  name: string;
  size?: number;
  index?: number;
  className?: string;
}

const AVATAR_COLORS = [
  "#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#e67e22",
  "#16a085", "#d35400", "#2c3e50", "#f39c12", "#1abc9c",
];

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, size = 32, className = "" }: AvatarProps) {
  const bg = nameToColor(name);
  return (
    <span
      className={`avatar ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.38,
        flexShrink: 0,
        userSelect: "none",
      }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const meta = STATUS_META[status as keyof typeof STATUS_META] ?? { label: status, color: "#aaa", bg: "rgba(0,0,0,0.05)" };
  return (
    <span
      className={`status-badge ${className}`}
      style={{
        background: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.color}`,
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 12,
        fontWeight: 600,
        display: "inline-block",
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

// ── LevelTag ──────────────────────────────────────────────────────────────────

interface LevelTagProps {
  level: string;
  isLeader?: boolean;
  className?: string;
}

const LEVEL_COLORS: Record<string, { bg: string; text: string }> = {
  senior: { bg: "#fde8d8", text: "#ca6f1e" },
  pleno:  { bg: "#d5f5e3", text: "#1e8449" },
  junior: { bg: "#d6eaf8", text: "#1a5276" },
};

export function LevelTag({ level, isLeader = false, className = "" }: LevelTagProps) {
  const colors = LEVEL_COLORS[level] ?? { bg: "#eee", text: "#555" };
  return (
    <span
      className={`level-tag ${className}`}
      style={{
        background: colors.bg,
        color: colors.text,
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 12,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
      }}
    >
      {LEVEL_LABELS[level as keyof typeof LEVEL_LABELS] ?? level}
      {isLeader && <span style={{ fontSize: 10 }}>★</span>}
    </span>
  );
}

// ── ChipGroup ─────────────────────────────────────────────────────────────────

interface ChipGroupProps {
  days: number[];
  color?: ChipColor;
  className?: string;
}

const DEFAULT_CHIP: ChipColor = { bg: "#eee", border: "#ccc", text: "#555" };

export function ChipGroup({ days, color = DEFAULT_CHIP, className = "" }: ChipGroupProps) {
  return (
    <span className={`chip-group ${className}`} style={{ display: "inline-flex", gap: 3, flexWrap: "wrap" }}>
      {days.map((d) => (
        <span
          key={d}
          style={{
            background: color.bg,
            border: `1px solid ${color.border}`,
            color: color.text,
            borderRadius: 4,
            padding: "1px 6px",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {DAY_NAMES[d] ?? d}
        </span>
      ))}
    </span>
  );
}

// ── WeekdayPicker ─────────────────────────────────────────────────────────────

interface WeekdayPickerProps {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: number[];
}

export function WeekdayPicker({ value, onChange, disabled = [] }: WeekdayPickerProps) {
  const days = [1, 2, 3, 4, 5];
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {days.map((d) => {
        const selected = value.includes(d);
        const isDisabled = disabled.includes(d);
        return (
          <button
            key={d}
            type="button"
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return;
              onChange(selected ? value.filter((x) => x !== d) : [...value, d].sort());
            }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              border: selected ? "2px solid #c0392b" : "1px solid #ddd",
              background: selected ? "#c0392b" : isDisabled ? "#f5f5f5" : "#fff",
              color: selected ? "#fff" : isDisabled ? "#bbb" : "#333",
              fontWeight: 600,
              fontSize: 12,
              cursor: isDisabled ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            {DAY_NAMES[d]}
          </button>
        );
      })}
    </div>
  );
}

// ── SelectableChipGroup ───────────────────────────────────────────────────────
interface SelectableChipGroupProps {
  options: { value: string | number; label: string }[];
  selected: (string | number)[];
  onToggle: (value: string | number) => void;
  single?: boolean;
  className?: string;
}
export function SelectableChipGroup({ options, selected, onToggle, single = false, className = "" }: SelectableChipGroupProps) {
  return (
    <div className={`chip-group ${className}`} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => { if (!single || !isSelected) onToggle(opt.value); }}
            style={{
              padding: "4px 12px", borderRadius: 20,
              border: isSelected ? "1.5px solid #c0392b" : "1.5px solid #ddd",
              background: isSelected ? "#c0392b" : "#fff",
              color: isSelected ? "#fff" : "#555",
              fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
