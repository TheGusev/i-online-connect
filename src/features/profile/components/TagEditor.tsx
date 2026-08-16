import { Plus } from "lucide-react";
import { useState } from "react";

import { Button, Chip, Input } from "@/components/ds";

import { InlineEditable } from "./InlineEdit";

/** Инлайн-редактор списка (интересы, ценности). */
export function TagEditor({
  items,
  label,
  addLabel,
  saving = false,
  onSave,
  variant = "interest",
}: {
  items: string[];
  label: string;
  addLabel: string;
  saving?: boolean;
  onSave: (next: string[]) => void;
  variant?: "interest" | "outline";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(items);
  const [value, setValue] = useState("");

  const add = () => {
    const next = value.trim();
    if (!next || draft.includes(next)) return;
    setDraft([...draft, next]);
    setValue("");
  };

  return (
    <InlineEditable
      editing={editing}
      saving={saving}
      onEdit={() => {
        setDraft(items);
        setValue("");
        setEditing(true);
      }}
      onCancel={() => setEditing(false)}
      onSave={() => {
        onSave(draft);
        setEditing(false);
      }}
      view={
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item}>
              <Chip variant={variant}>{item}</Chip>
            </li>
          ))}
        </ul>
      }
      form={
        <div className="space-y-3">
          <ul className="flex flex-wrap gap-2">
            {draft.map((item) => (
              <li key={item}>
                <Chip
                  variant={variant}
                  onRemove={() => setDraft(draft.filter((entry) => entry !== item))}
                >
                  {item}
                </Chip>
              </li>
            ))}
          </ul>
          <div className="flex items-end gap-2">
            <Input
              label={label}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
            />
            <Button size="md" variant="secondary" onClick={add}>
              <Plus aria-hidden="true" />
              {addLabel}
            </Button>
          </div>
        </div>
      }
    />
  );
}
