/**
 * Schema Gap Audit
 * Compare code usage with actual Supabase schema
 * Usage: npx tsx scripts/audit-schema-gaps.ts
 */

import { createClient } from "@/lib/supabase-server";

const EXPECTED_TABLES = {
  // Core
  projects: ["id", "project_name", "client_name", "status", "inputs", "calc", "deleted_at", "owner_user_id", "location_text", "location_lat", "location_lng", "location_address", "travel_km", "travel_minutes"],
  conversations: ["id", "project_id", "client_id", "created_at"],
  messages: ["id", "conversation_id", "sender_type", "sender_user_id", "body", "created_at"],
  message_reads: ["message_id", "user_id"],
  // CRM
  crm_contacts: ["id", "name", "email", "phone", "company", "notes", "tags", "user_id", "deleted_at"],
  crm_deals: ["id", "title", "stage", "value", "contact_id", "company_id", "project_id", "user_id", "deleted_at", "closed_at"],
  crm_companies: ["id", "name"],
  crm_stages: ["id", "name", "order"],
  crm_activities: ["id", "contact_id", "deal_id", "type", "body"],
  // Project structure
  checklists: ["id", "name", "project_id", "user_id", "deleted_at"],
  checklist_items: ["id", "checklist_id", "text", "completed"],
  templates: ["id", "name", "type", "user_id", "deleted_at"],
  template_items: ["id", "template_id", "categoria", "nome"],
  project_members: ["project_id", "user_id", "role"],
  // Journal & Tasks
  journal_entries: ["id", "user_id", "project_id", "title", "body", "mood", "tags", "created_at", "deleted_at"],
  tasks: ["id", "user_id", "project_id", "title", "description", "status", "priority", "due_date", "created_at", "deleted_at"],
  // Client management
  clients: ["id", "name", "slug", "created_at", "deleted_at"],
  client_users: ["id", "user_id", "client_id", "role"],
  team_members: ["user_id", "org_id", "role"],
  organizations: ["id", "name"],
  // Project delivery
  deliverable_files: ["id", "project_id", "filename", "ext", "file_type", "created_at"],
  project_dropbox: ["project_id", "root_path", "last_sync_at"],
  call_sheets: ["id", "project_id", "title", "created_at", "deleted_at"],
  call_sheet_people: ["id", "call_sheet_id", "name", "role"],
  call_sheet_schedule: ["id", "call_sheet_id", "title", "start_time"],
  logistics_routes: ["id", "user_id", "project_id", "origin", "destination", "distance_km"],
  // Catalog
  catalog_items: ["id", "org_id", "categoria", "nome", "preco_base", "deleted_at"],
  // Notifications
  notifications: ["id", "user_id", "type", "read_at"],
  email_outbox: ["id", "to_email", "template", "sent_at"],
  // Org settings
  org_settings: ["org_id", "diesel_price_per_liter", "petrol_price_per_liter"],
  preferences: ["user_id", "theme", "language"],
  // Weather
  weather_cache: ["id", "latitude", "longitude", "location_name", "user_id", "cached_at"],
};

async function main() {
  try {
    const sb = await createClient();

    console.log("\n📊 SCHEMA GAP AUDIT\n");

    let totalMissing = 0;
    let totalColumnGaps = 0;

    // Check each table
    for (const [tableName, expectedCols] of Object.entries(EXPECTED_TABLES)) {
      try {
        // Try to select from table
        const { data, error } = await sb
          .from(tableName)
          .select("*")
          .limit(1);

        if (error) {
          console.log(`❌ TABLE MISSING: ${tableName}`);
          console.log(`   Error: ${error.message}`);
          totalMissing++;
          continue;
        }

        // Check columns
        if (data && data.length > 0) {
          const actualCols = Object.keys(data[0]);
          const missingCols = expectedCols.filter(col => !actualCols.includes(col));

          if (missingCols.length > 0) {
            console.log(`⚠️  COLUMNS MISSING in ${tableName}:`);
            missingCols.forEach(col => console.log(`   - ${col}`));
            totalColumnGaps += missingCols.length;
          } else {
            console.log(`✅ ${tableName} (${actualCols.length} cols)`);
          }
        } else {
          console.log(`✅ ${tableName} (table exists, no sample rows)`);
        }
      } catch (err) {
        console.log(`❌ ERROR checking ${tableName}: ${err}`);
        totalMissing++;
      }
    }

    console.log(`\n📋 SUMMARY:`);
    console.log(`   Missing tables: ${totalMissing}`);
    console.log(`   Missing columns: ${totalColumnGaps}`);
    console.log(`   Status: ${totalMissing === 0 && totalColumnGaps === 0 ? "✅ READY" : "⚠️ NEEDS MIGRATIONS"}\n`);

    process.exit(totalMissing > 0 || totalColumnGaps > 0 ? 1 : 0);
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}

main();
