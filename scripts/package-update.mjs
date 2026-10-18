import { mkdir, copyFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
await mkdir(new URL("dist/updates/", root), { recursive: true });
await copyFile(
  new URL("supabase/migrations/202610170004_store_pages.sql", root),
  new URL("dist/updates/store-pages.sql", root),
);
await copyFile(
  new URL("supabase/migrations/202610170005_billing.sql", root),
  new URL("dist/updates/billing.sql", root),
);
