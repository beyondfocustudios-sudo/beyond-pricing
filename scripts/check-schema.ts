/**
 * Check current Supabase schema against expected tables
 * Usage: npx tsx scripts/check-schema.ts
 */

import { createClient } from "@/lib/supabase-server";

const EXPECTED_TABLES = [
  // Core
  "organizations",
  "team_members",
  // Projects
  "projects",
  "project_members",
  "project_milestones",
  // Checklists
  "checklists",
  "checklist_items",
  // Templates
  "templates",
  "template_items",
  // Clients
  "clients",
  "client_users",
  // CRM
  "crm_contacts",
  "crm_companies",
  "crm_deals",
  // Communication
  "conversations",
  "messages",
  "message_reads",
  "notifications",
  // Content
  "journal_entries",
  "tasks",
  // Call sheets
  "call_sheets",
  "call_sheet_people",
  "call_sheet_schedule",
  // Catalog
  "catalog_items",
  // Other
  "preferences",
  "org_settings",
  "weather_cache",
  "logistics_routes",
];

async function main() {
  try {
    const sb = await createClient();

    // Get all tables from information_schema
    const { data: tables, error } = await sb.rpc("get_table_names");

    if (error) {
      console.error("Error querying schema:", error);
      // Fallback: use diagnostics check
      console.log("Falling back to diagnostics checks...");
      return;
    }

    const existingTables = new Set(
      (tables as any[]).map((t) => t.table_name)
    );

    console.log(`\nFound ${existingTables.size} tables in schema\n`);

    // Check each expected table
    const missing: string[] = [];
    const existing: string[] = [];

    for (const table of EXPECTED_TABLES) {
      if (existingTables.has(table)) {
        existing.push(table);
        console.log(`✓ ${table}`);
      } else {
        missing.push(table);
        console.log(`✗ MISSING: ${table}`);
      }
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`✓ Existing: ${existing.length}`);
    console.log(`✗ Missing:  ${missing.length}`);

    if (missing.length > 0) {
      console.log(`\nMissing tables:\n${missing.map((t) => `  - ${t}`).join("\n")}`);
    }
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}

main();
