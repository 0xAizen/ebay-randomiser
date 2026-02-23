type SupabaseKvConfig = {
  url: string;
  serviceRoleKey: string;
};

function getSupabaseKvConfig(): SupabaseKvConfig | null {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url || !serviceRoleKey) return null;
  return { url: url.replace(/\/+$/, ""), serviceRoleKey };
}

export function isSupabaseKvEnabled(): boolean {
  return getSupabaseKvConfig() !== null;
}

export async function readSupabaseKv(key: string): Promise<string | null> {
  const config = getSupabaseKvConfig();
  if (!config) return null;

  const response = await fetch(
    `${config.url}/rest/v1/app_kv?select=value&key=eq.${encodeURIComponent(key)}&limit=1`,
    {
      method: "GET",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Failed to read from Supabase app_kv.");
  }

  const rows = (await response.json()) as Array<{ value?: string }>;
  const value = rows[0]?.value;
  return typeof value === "string" ? value : null;
}

export async function writeSupabaseKv(key: string, value: string): Promise<boolean> {
  const config = getSupabaseKvConfig();
  if (!config) return false;

  const response = await fetch(`${config.url}/rest/v1/app_kv?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([{ key, value }]),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to write to Supabase app_kv.");
  }

  return true;
}
