export type ItemConfigEntry = {
  name: string;
  qty: number;
};

const LINE_REGEX = /^(.*?)\s*-\s*QTY\s*(\d+)$/i;

export function parseItemConfig(text: string): ItemConfigEntry[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const entries = lines.map((line, index) => {
    const match = line.match(LINE_REGEX);
    if (!match) {
      throw new Error(`Invalid line ${index + 1}: "${line}". Use format: Item Name - QTY 123`);
    }

    const name = match[1].trim();
    const qty = Number(match[2]);

    if (!name) {
      throw new Error(`Invalid line ${index + 1}: item name cannot be empty.`);
    }

    if (!Number.isInteger(qty) || qty < 1) {
      throw new Error(`Invalid line ${index + 1}: quantity must be a whole number above 0.`);
    }

    return { name, qty };
  });

  if (entries.length === 0) {
    throw new Error("Config cannot be empty.");
  }

  return entries;
}

export function expandItemEntries(entries: ItemConfigEntry[]): string[] {
  const expanded: string[] = [];

  for (const entry of entries) {
    for (let i = 0; i < entry.qty; i += 1) {
      expanded.push(entry.name);
    }
  }

  return expanded;
}

export function getTotalQty(entries: ItemConfigEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.qty, 0);
}
