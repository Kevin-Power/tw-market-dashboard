import { createFileRoute } from "@tanstack/react-router";
import { getMarketSnapshot } from "@/lib/market.server";
import {
  artifactToBytes,
  buildCsvParts,
  buildExportArtifact,
  type ExportFormat,
} from "@/lib/export-market";

const FORMATS = new Set<ExportFormat>([
  "xlsx",
  "json",
  "csv-bundle",
  "summary",
  "html",
  "html-email",
]);

function cors(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

/**
 * GET /api/export?format=xlsx|json|csv-bundle|summary|html|html-email
 * GET /api/export?format=csv&sheet=foreign_buy|foreign_sell|trust_buy|trust_sell|highs|lows|holdings
 */
export const Route = createFileRoute("/api/export")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: cors(request) }),

      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const formatRaw = (
            url.searchParams.get("format") || "xlsx"
          ).toLowerCase();
          const sheet = url.searchParams.get("sheet");

          const snap = await getMarketSnapshot();
          const data = snap.data;

          if (formatRaw === "csv" && sheet) {
            const parts = buildCsvParts(data);
            const map: Record<string, number> = {
              foreign_buy: 0,
              foreign_sell: 1,
              trust_buy: 2,
              trust_sell: 3,
              highs: 4,
              lows: 5,
              holdings: 6,
            };
            const idx = map[sheet];
            if (idx == null || !parts[idx]) {
              return Response.json(
                { error: "invalid_sheet", sheets: Object.keys(map) },
                { status: 400, headers: cors(request) },
              );
            }
            const part = parts[idx]!;
            return new Response(part.csv, {
              status: 200,
              headers: {
                ...cors(request),
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(part.name)}`,
                "Cache-Control": "public, max-age=60",
              },
            });
          }

          if (!FORMATS.has(formatRaw as ExportFormat)) {
            return Response.json(
              {
                error: "invalid_format",
                formats: [...FORMATS, "csv"],
                hint: "xlsx | json | csv-bundle | summary | html | html-email | csv&sheet=",
              },
              { status: 400, headers: cors(request) },
            );
          }

          const artifact = buildExportArtifact(
            data,
            formatRaw as ExportFormat,
          );
          const bytes = artifactToBytes(artifact);
          const copy = new Uint8Array(bytes.byteLength);
          copy.set(bytes);

          const disposition =
            formatRaw === "html" || formatRaw === "html-email"
              ? url.searchParams.get("inline") === "1"
                ? "inline"
                : "attachment"
              : "attachment";

          return new Response(copy, {
            status: 200,
            headers: {
              ...cors(request),
              "Content-Type": artifact.mime,
              "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
              "Cache-Control": "public, max-age=60",
              "X-Market-AsOf": data.asOf,
              "X-Market-Source": snap.source,
              "X-Document-Id": `TWFLOW-${data.asOf.replace(/-/g, "")}`,
            },
          });
        } catch (err) {
          console.error("[api/export]", err);
          return Response.json(
            {
              error: "export_failed",
              hint: err instanceof Error ? err.message : String(err),
            },
            { status: 500, headers: cors(request) },
          );
        }
      },
    },
  },
});
