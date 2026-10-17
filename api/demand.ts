import { readiness, receiveDemand } from "../server/demand-handler.js";
export function GET() {
  return readiness();
}
export async function POST(request: Request) {
  return receiveDemand(request);
}
