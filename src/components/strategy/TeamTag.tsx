import { useState } from "react";
import { Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TAG_MAX_LENGTH, sameTag, type LivePicklistTag } from "@/lib/livePicklists";

const TAG_COLORS = ["#dc2626", "#ea580c", "#f59e0b", "#16a34a", "#0d9488", "#2563eb", "#9333ea", "#db2777", "#6b7280"];

/** Black or white, whichever reads better on the given hex color. */
function textColorOn(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

const sameText = (a: LivePicklistTag, b: LivePicklistTag) => a.text.toLowerCase() === b.text.toLowerCase();

export function TeamTagPill({ tag, className = "" }: { tag: LivePicklistTag; className?: string }) {
  return (
    <span
      className={`inline-block max-w-full truncate rounded px-1.5 text-[10px] font-semibold leading-4 ${className}`}
      style={{ backgroundColor: tag.color, color: textColorOn(tag.color) }}
      title={tag.text}
    >
      {tag.text}
    </span>
  );
}

/**
 * A team's tags, wrapping onto more lines as needed. With `dots`, just a circle of each
 * tag's color (the text is in the team's info popup), for cards where space is tight.
 */
export function TeamTags({ tags, dots }: { tags: LivePicklistTag[]; dots?: boolean }) {
  return (
    <span className={`flex min-w-0 flex-wrap ${dots ? "gap-1 py-0.5" : "gap-1"}`}>
      {tags.map((tag) =>
        dots ? (
          <span
            key={`${tag.text}:${tag.color}`}
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: tag.color }}
            title={tag.text}
            aria-label={tag.text}
          />
        ) : (
          <TeamTagPill key={`${tag.text}:${tag.color}`} tag={tag} />
        )
      )}
    </span>
  );
}

/**
 * Every tag in use, to pick some and fade the teams that don't have all of them. Clicking a chosen
 * tag again unpicks it; Clear shows every team. Shows nothing until there are tags.
 */
export function TagFilter({
  tags,
  selected,
  onChange,
}: {
  tags: LivePicklistTag[];
  selected: LivePicklistTag[];
  onChange: (tags: LivePicklistTag[]) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {tags.map((tag) => {
        const active = selected.some((chosen) => sameTag(chosen, tag));
        return (
          <button
            key={`${tag.text}:${tag.color}`}
            type="button"
            aria-pressed={active}
            title={active ? `Stop highlighting "${tag.text}"` : `Highlight teams tagged "${tag.text}"`}
            onClick={() => onChange(active ? selected.filter((chosen) => !sameTag(chosen, tag)) : [...selected, tag])}
            className={`flex cursor-pointer rounded transition-opacity ${
              active
                ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                : selected.length > 0
                  ? "opacity-50 hover:opacity-100"
                  : "hover:opacity-80"
            }`}
          >
            <TeamTagPill tag={tag} className="py-0.5 text-xs" />
          </button>
        );
      })}
      {selected.length > 0 && (
        <button type="button" onClick={() => onChange([])} className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Clear
        </button>
      )}
    </div>
  );
}

/**
 * A team's tags in the live picklist: remove or edit the ones it has, apply tags already
 * made for other teams, or make a new one. Key it by team so it resets.
 */
export function TeamTagEditor({
  teamNumber,
  tags,
  existingTags,
  onChange,
}: {
  teamNumber: number;
  tags: LivePicklistTag[];
  /** Tags already made at this event, offered to apply with one tap. */
  existingTags: LivePicklistTag[];
  onChange: (tags: LivePicklistTag[]) => void;
}) {
  const [text, setText] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  // Which of the team's tags the form is editing; null when making a new one.
  const [editing, setEditing] = useState<number | null>(null);
  const trimmed = text.trim();
  const draft = { text: trimmed, color };
  // A team can't have two tags with the same text.
  const duplicate = tags.some((tag, index) => index !== editing && sameText(tag, draft));
  const unchanged = editing != null && sameTag(tags[editing], draft) && tags[editing].text === trimmed;
  const canSave = !!trimmed && !duplicate && !unchanged;
  const applicable = existingTags.filter((existing) => !tags.some((tag) => sameText(tag, existing)));

  const resetForm = () => {
    setText("");
    setColor(TAG_COLORS[0]);
    setEditing(null);
  };

  const save = () => {
    if (!canSave) return;
    onChange(editing == null ? [...tags, draft] : tags.map((tag, index) => (index === editing ? draft : tag)));
    resetForm();
  };

  const remove = (index: number) => {
    onChange(tags.filter((_, other) => other !== index));
    if (editing === index) resetForm();
    else if (editing != null && editing > index) setEditing(editing - 1);
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <p className="mr-1 text-sm font-semibold">Tags</p>
        {tags.length === 0 && <p className="text-xs text-muted-foreground">None yet</p>}
        {tags.map((tag, index) => (
          <span
            key={`${tag.text}:${tag.color}`}
            className={`flex items-stretch rounded ${editing === index ? "ring-2 ring-foreground ring-offset-1 ring-offset-background" : ""}`}
          >
            <button
              type="button"
              title="Edit this tag"
              onClick={() => {
                setEditing(index);
                setText(tag.text);
                setColor(tag.color);
              }}
              className="flex"
            >
              <TeamTagPill tag={tag} className="rounded-r-none py-0.5 text-xs" />
            </button>
            <button
              type="button"
              aria-label={`Remove tag ${tag.text}`}
              title="Remove"
              onClick={() => remove(index)}
              className="flex items-center rounded-r px-1 hover:brightness-110"
              style={{ backgroundColor: tag.color, color: textColorOn(tag.color) }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            aria-label={editing == null ? `New tag for ${teamNumber}` : "Edit tag"}
            value={text}
            maxLength={TAG_MAX_LENGTH}
            placeholder={editing == null ? "New tag, e.g. Great climber" : "Edit tag"}
            onChange={(changeEvent) => setText(changeEvent.target.value.slice(0, TAG_MAX_LENGTH))}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === "Enter") save();
            }}
            className="h-8 pr-12"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums">
            {text.length}/{TAG_MAX_LENGTH}
          </span>
        </div>
        {editing != null && (
          <Button variant="outline" size="sm" className="h-8" onClick={resetForm}>
            Cancel
          </Button>
        )}
        <Button size="sm" className="h-8" disabled={!canSave} onClick={save}>
          {editing == null ? "Add" : "Save"}
        </Button>
      </div>
      {duplicate && <p className="text-xs text-destructive">This team already has a tag with that text.</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        {TAG_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Color ${swatch}`}
            aria-pressed={color === swatch}
            onClick={() => setColor(swatch)}
            className={`h-5 w-5 rounded-full border-2 transition-transform ${
              color === swatch ? "scale-110 border-foreground" : "border-transparent"
            }`}
            style={{ backgroundColor: swatch }}
          />
        ))}
        {/* Any other color, from the browser's color picker */}
        <label
          className={`relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border-2 ${
            TAG_COLORS.includes(color) ? "border-transparent" : "scale-110 border-foreground"
          }`}
          // Drawn from the outer edge so the gradient doesn't repeat into the (transparent) border
          style={{
            backgroundColor: color,
            backgroundImage: TAG_COLORS.includes(color) ? "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" : "none",
            backgroundOrigin: "border-box",
          }}
          title="Custom color"
        >
          <input
            type="color"
            value={color}
            onChange={(changeEvent) => setColor(changeEvent.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
            aria-label="Custom color"
          />
        </label>
      </div>

      {applicable.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Existing:</span>
          {applicable.map((tag) => (
            <button
              key={`${tag.text}:${tag.color}`}
              type="button"
              title={`Add "${tag.text}"`}
              onClick={() => onChange([...tags, tag])}
              className="flex rounded opacity-80 transition-opacity hover:opacity-100"
            >
              <TeamTagPill tag={tag} className="py-0.5 text-xs" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
