import type { ConsultantLevel, ProjectStatus } from "@/types";
import { LEVEL_LABELS, STATUS_META } from "@/lib/domain";

// ─── Avatar ───────────────────────────────────────────────────────────────────

const AV_COLORS: [string, string][] = [
  ["#fadbd8", "#c0392b"], ["#d6eaf8", "#2874a6"], ["#d5f5e3", "#1e8449"],
  ["#e8daef", "#7d3c98"], ["#fdf2d0", "#9a7d0a"], ["#d1f2eb", "#148f77"],
  ["#fde8d8", "#ca6f1e"], ["#d6dbdf", "#5d6d7e"],
];

interface AvatarProps {
  name: string;
  index?: number;
  size?: number;
}

export function Avatar({ name, index = 0, size = 34 }: AvatarProps) {
  const [bg, fg] = AV_COLORS[index % AV_COLORS.length];
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: bg, color: fg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: size * 0.35, flexShrink: 0,
        fontFamily: "'Syne', sans-serif",
      }}
    >
      {initials}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="badge" style={{ background: m.bg, color: m.color }}>
      <span className="badge-dot" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

// ─── Level Tag ────────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<ConsultantLevel, [string, string]> = {
  senior: ["#f4ecfb", "#7d3c98"],
  pleno:  ["#ebf5fb", "#2874a6"],
  junior: ["#e9f7ef", "#1e8449"],
};

export function LevelTag({ level, isLeader }: { level: ConsultantLevel; isLeader: boolean }) {
  const [bg, fg] = LEVEL_COLORS[level];
  return (
    <span className="level-tag" style={{ background: bg, color: fg }}>
      {isLeader ? "★ " : ""}{LEVEL_LABELS[level]}
    </span>
  );
}

// ─── Capacity Bar ─────────────────────────────────────────────────────────────

export function CapBar({ used, max }: { used: number; max: number }) {
  const pct = Math.min(100, (used / max) * 100);
  const color = pct >= 90 ? "#e74c3c" : pct >= 70 ? "#e67e22" : "#27ae60";
  return (
    <div className="cap-bar-wrap">
      <div className="cap-bar-labels">
        <span>{used.toFixed(1)}d usados</span>
        <span>{max}d máx</span>
      </div>
      <div className="cap-bar-track">
        <div className="cap-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ─── Chip Selector ────────────────────────────────────────────────────────────

interface ChipOption {
  value: string | number;
  label: string;
}

interface ChipGroupProps {
  options: ChipOption[];
  selected: (string | number)[];
  onToggle: (value: string | number) => void;
  single?: boolean;
}

export function ChipGroup({ options, selected, onToggle, single = false }: ChipGroupProps) {
  return (
    <div className="chip-group">
      {options.map((o) => (
        <div
          key={o.value}
          className={`chip ${selected.includes(o.value) ? "selected" : ""}`}
          onClick={() => {
            if (single) {
              onToggle(o.value);
            } else {
              onToggle(o.value);
            }
          }}
        >
          {o.label}
        </div>
      ))}
    </div>
  );
}
