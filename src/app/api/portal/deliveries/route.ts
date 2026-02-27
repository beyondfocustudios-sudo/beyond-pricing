import { NextRequest } from "next/server";
import { GET as getDeliverables } from "@/app/api/portal/deliverables/route";

export async function GET(request: NextRequest) {
  return getDeliverables(request);
}

