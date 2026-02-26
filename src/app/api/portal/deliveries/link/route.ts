import { NextRequest } from "next/server";
import { POST as postDeliverableLink } from "@/app/api/portal/deliverables/link/route";

export async function POST(request: NextRequest) {
  return postDeliverableLink(request);
}

