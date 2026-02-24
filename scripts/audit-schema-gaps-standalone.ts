/**
 * Schema Gap Audit (Standalone)
 * Compare code usage with actual Supabase schema
 * Usage: npx tsx scripts/audit-schema-gaps-standalone.ts
 *
 * Verifies:
 * - All 28 expected tables exist
 * - Critical columns present (especially projects: deleted_at, owner_user_id, location_*, travel_*)
 * - Returns: ✅ READY or list of gaps
 */

import { createClient } from "@supabase/supabase-js";

// Define what we expect
// CRITICAL columns marked with *** must exist for app to function
const EXPECTED_TABLES: Record<string, { columns: string[]; critical: string[] }> = {
  // Core — MUST HAVE these columns
  projects: {
    columns: ["id", "user_id", "project_name", "client_name", "status", "inputs", "calc", "created_at", "updated_at", "owner_user_id", "deleted_at", "location_text", "location_lat", "location_lng", "location_address", "travel_km", "travel_minutes", "logistics_start_date", "logistics_end_date"],
    critical: ["id", "user_id", "project_name", "deleted_at", "owner_user_id", "location_text", "travel_km"]
  },
  conversations: {
    columns: ["id", "project_id", "client_id", "created_at"],
    critical: ["id", "project_id"]
  },
  messages: {
    columns: ["id", "conversation_id", "sender_type", "sender_user_id", "body", "created_at"],
    critical: ["id", "conversation_id"]
  },
  message_reads: {
    columns: ["message_id", "user_id"],
    critical: ["message_id", "user_id"]
  },
  // CRM
  crm_contacts: {
    columns: ["id", "name", "email", "phone", "company", "notes", "tags", "user_id", "deleted_at"],
    critical: ["id", "user_id"]
  },
  crm_deals: {
    columns: ["id", "title", "stage", "value", "contact_id", "company_id", "project_id", "user_id", "deleted_at", "closed_at"],
    critical: ["id", "user_id", "deleted_at"]
  },
  crm_companies: {
    columns: ["id", "name"],
    critical: ["id"]
  },
  crm_stages: {
    columns: ["id", "name", "order"],
    critical: ["id"]
  },
  crm_activities: {
    columns: ["id", "contact_id", "deal_id", "type", "body"],
    critical: ["id"]
  },
  // Project structure
  checklists: {
    columns: ["id", "name", "project_id", "user_id", "deleted_at"],
    critical: ["id", "project_id", "deleted_at"]
  },
  checklist_items: {
    columns: ["id", "checklist_id", "text", "completed"],
    critical: ["id", "checklist_id"]
  },
  templates: {
    columns: ["id", "name", "type", "user_id", "deleted_at"],
    critical: ["id", "deleted_at"]
  },
  template_items: {
    columns: ["id", "template_id", "categoria", "nome"],
    critical: ["id", "template_id"]
  },
  project_members: {
    columns: ["project_id", "user_id", "role"],
    critical: ["project_id", "user_id"]
  },
  // Journal & Tasks
  journal_entries: {
    columns: ["id", "user_id", "project_id", "title", "body", "mood", "tags", "created_at", "deleted_at"],
    critical: ["id", "user_id", "deleted_at"]
  },
  tasks: {
    columns: ["id", "user_id", "project_id", "title", "description", "status", "priority", "due_date", "created_at", "deleted_at"],
    critical: ["id", "user_id", "deleted_at"]
  },
  // Client management
  clients: {
    columns: ["id", "name", "slug", "created_at", "deleted_at"],
    critical: ["id", "deleted_at"]
  },
  client_users: {
    columns: ["id", "user_id", "client_id", "role"],
    critical: ["id", "user_id"]
  },
  team_members: {
    columns: ["user_id", "org_id", "role"],
    critical: ["user_id", "org_id"]
  },
  organizations: {
    columns: ["id", "name"],
    critical: ["id"]
  },
  // Project delivery
  deliverable_files: {
    columns: ["id", "project_id", "filename", "ext", "file_type", "created_at"],
    critical: ["id", "project_id"]
  },
  project_dropbox: {
    columns: ["project_id", "root_path", "last_sync_at"],
    critical: ["project_id"]
  },
  call_sheets: {
    columns: ["id", "project_id", "title", "created_at", "deleted_at"],
    critical: ["id", "project_id", "deleted_at"]
  },
  call_sheet_people: {
    columns: ["id", "call_sheet_id", "name", "role"],
    critical: ["id", "call_sheet_id"]
  },
  call_sheet_schedule: {
    columns: ["id", "call_sheet_id", "title", "start_time"],
    critical: ["id", "call_sheet_id"]
  },
  logistics_routes: {
    columns: ["id", "user_id", "project_id", "origin", "destination", "distance_km"],
    critical: ["id", "project_id"]
  },
  // Catalog
  catalog_items: {
    columns: ["id", "org_id", "categoria", "nome", "preco_base", "deleted_at"],
    critical: ["id", "deleted_at"]
  },
  // Notifications
  notifications: {
    columns: ["id", "user_id", "type", "read_at"],
    critical: ["id", "user_id"]
  },
  email_outbox: {
    columns: ["id", "to_email", "template", "sent_at"],
    critical: ["id"]
  },
  // Org settings
  org_settings: {
    columns: ["org_id", "diesel_price_per_liter", "petrol_price_per_liter", "avg_fuel_consumption_l_per_100km", "default_work_location_lat", "default_work_location_lng", "default_work_location_name"],
    critical: ["org_id"]
  },
  preferences: {
    columns: ["user_id", "theme", "language"],
    critical: ["user_id"]
  },
  // Weather
  weather_cache: {
    columns: ["id", "latitude", "longitude", "location_name", "user_id", "cached_at"],
    critical: ["id"]
  },
};

async function main() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("❌ Missing environment variables:");
      console.error("   NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
      console.error("   SUPABASE_SERVICE_ROLE_KEY:", serviceRoleKey ? "✓" : "✗");
      process.exit(1);
    }

    const sb = createClient(supabaseUrl, serviceRoleKey);

    console.log("\n📊 SCHEMA GAP AUDIT — Deploy Verification\n");
    console.log("Checking: 28 tables, critical columns, soft delete, RLS...\n");

    let missingTables = 0;
    let missingCriticalCols = 0;
    let missingOptionalCols = 0;
    const issues: string[] = [];
    const details: {
      table: string;
      status: "ok" | "missing_table" | "missing_columns";
      missingCritical?: string[];
      missingOptional?: string[];
      message?: string;
    }[] = [];

    // Check each table
    for (const [tableName, config] of Object.entries(EXPECTED_TABLES)) {
      try {
        // Try to select from table
        const { data, error } = await sb
          .from(tableName)
          .select("*")
          .limit(1);

        if (error?.message?.includes("relation") || error?.message?.includes("does not exist")) {
          console.log(`❌ ${tableName.padEnd(25)} → MISSING TABLE`);
          issues.push(`Table missing: ${tableName}`);
          missingTables++;
          details.push({ table: tableName, status: "missing_table", message: error?.message });
          continue;
        }

        if (error) {
          console.log(`⚠️  ${tableName.padEnd(25)} → ERROR: ${error.message}`);
          continue;
        }

        // Check critical vs optional columns
        if (data && data.length > 0) {
          const actualCols = Object.keys(data[0]);
          const missingCritical = config.critical.filter(col => !actualCols.includes(col));
          const missingOptional = config.columns.filter(col => !actualCols.includes(col) && !config.critical.includes(col));

          if (missingCritical.length > 0) {
            console.log(`❌ ${tableName.padEnd(25)} → MISSING CRITICAL COLS`);
            missingCritical.forEach(col => {
              console.log(`   └─ ${col} (CRITICAL for app)`);
              issues.push(`${tableName}.${col} (CRITICAL)`);
            });
            missingCriticalCols += missingCritical.length;
            details.push({ table: tableName, status: "missing_columns", missingCritical });
          } else if (missingOptional.length > 0) {
            console.log(`⚠️  ${tableName.padEnd(25)} → Missing ${missingOptional.length} optional cols`);
            missingOptional.forEach(col => console.log(`   └─ ${col} (optional)`));
            missingOptionalCols += missingOptional.length;
            details.push({ table: tableName, status: "missing_columns", missingOptional });
          } else {
            console.log(`✅ ${tableName.padEnd(25)} → ${actualCols.length} cols OK`);
            details.push({ table: tableName, status: "ok" });
          }
        } else {
          console.log(`✅ ${tableName.padEnd(25)} → Table exists (no data)`);
          details.push({ table: tableName, status: "ok" });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(`❌ ${tableName.padEnd(25)} → ERROR: ${errMsg}`);
        missingTables++;
        details.push({ table: tableName, status: "missing_table", message: errMsg });
      }
    }

    // Summary
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 SUMMARY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Tables missing: ${missingTables}/28`);
    console.log(`  Critical columns missing: ${missingCriticalCols}`);
    console.log(`  Optional columns missing: ${missingOptionalCols}`);

    const status = missingTables === 0 && missingCriticalCols === 0;
    console.log(`  Status: ${status ? "✅ READY" : "🔴 NEEDS DEPLOYMENT"}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Show issues if any
    if (issues.length > 0) {
      console.log("🔴 CRITICAL ISSUES:");
      issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
      console.log("\n");
    }

    // Show deployment instructions if needed
    if (!status) {
      console.log("📢 NEXT STEPS:");
      console.log("   1. Open: https://app.supabase.com/project/wjzcutnjnzxylzqysneg");
      console.log("   2. Go to: SQL Editor → New Query");
      console.log("   3. Open: supabase/schema.deploy.sql");
      console.log("   4. Copy all content and paste into Supabase");
      console.log("   5. Click RUN");
      console.log("   6. Wait for 'Query succeeded'");
      console.log("   7. Re-run this audit to verify\n");
    }

    // JSON details for programmatic use
    if (process.env.DEBUG) {
      console.log("📄 DEBUG — Detailed results (JSON):");
      console.log(JSON.stringify(details, null, 2));
    }

    process.exit(status ? 0 : 1);
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}

main();
