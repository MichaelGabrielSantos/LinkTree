import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isJobName, JOBS } from "@/server/ingestion/jobs";

// Limite do plano Hobby da Vercel (1–60 s). Jobs pesados rodam pela CLI.
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Disparo agendado: GET /api/cron/ingest?job=noticias (header Authorization: Bearer $CRON_SECRET). */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const job = new URL(req.url).searchParams.get("job") ?? "";
  // Jobs pesados (arquivos anuais, histórico completo) rodam pela CLI, não por requisição web.
  if (!isJobName(job) || !["noticias", "deputados", "seguidos"].includes(job)) {
    return NextResponse.json({ error: "Job inválido para disparo web" }, { status: 400 });
  }
  const results = await JOBS[job]([]);
  return NextResponse.json({ job, results: results.map((r) => ("status" in r ? { status: r.status, runId: r.runId } : r)) });
}
