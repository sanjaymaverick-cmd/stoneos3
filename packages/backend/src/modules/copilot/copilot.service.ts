import { Injectable, Logger } from "@nestjs/common";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pool } from "pg";
import { PrismaService } from "../../common/prisma.service";
import { validateGeneratedSql } from "./sql-validator";
import { COPILOT_SCHEMA_CONTEXT } from "./copilot-schema-context";
import { DEMO_MODE } from "../../common/demo";
import { demoCopilotAnswer } from "./copilot-demo-answers";

export interface CopilotAnswer {
  answer: string;
  sql: string | null;
}

const FRIENDLY_VALIDATION_ERROR = "I couldn't safely answer that — try rephrasing your question.";
const FRIENDLY_UNAVAILABLE_ERROR =
  "The Copilot is temporarily unavailable — a database safety check failed at startup. Please contact your administrator.";
const FRIENDLY_GENERIC_ERROR = "I couldn't answer that just now — please try again.";

interface LogAttemptInput {
  factoryId: string;
  userId: string;
  question: string;
  generatedSql: string | null;
  rowCount: number | null;
  answer: string | null;
  errorMessage: string | null;
}

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  private readonly genAI: GoogleGenerativeAI | null;
  private readonly pool: Pool | null;

  constructor(private prisma: PrismaService) {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    this.genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    if (!apiKey) {
      this.logger.warn("GEMINI_API_KEY/GOOGLE_API_KEY not set — /copilot/ask will fail generateSql() until configured.");
    }

    const connStr = process.env.COPILOT_DATABASE_URL;
    this.pool = connStr ? new Pool({ connectionString: connStr, max: 5 }) : null;
    if (!connStr) {
      this.logger.warn("COPILOT_DATABASE_URL not set — /copilot/ask will fail at query execution until configured.");
    }
  }

  // Entry point for CopilotController. `moduleReady` is the Step 6A
  // RLS-coverage-assertion flag (see CopilotReadinessService) — checked by
  // the caller so a failed startup check surfaces as a friendly response
  // and a logged attempt, never a silent request that skips scoping.
  async ask(factoryId: string, userId: string, question: string, moduleReady: boolean): Promise<CopilotAnswer> {
    // Demo environment without a Gemini key: serve canned answers over the
    // seeded demo data instead of failing at generateSql(). If a real key is
    // configured (this.genAI is set), fall through to the live path even in
    // demo mode. The attempt is still logged for audit parity.
    if (DEMO_MODE && !this.genAI) {
      const { answer, sql } = demoCopilotAnswer(question);
      await this.logAttempt({
        factoryId,
        userId,
        question,
        generatedSql: sql,
        rowCount: null,
        answer,
        errorMessage: "demo-mode canned answer (no Gemini key configured)",
      });
      return { answer, sql };
    }

    if (!moduleReady) {
      await this.logAttempt({
        factoryId,
        userId,
        question,
        generatedSql: null,
        rowCount: null,
        answer: null,
        errorMessage: "Rejected: Copilot module readiness check (RLS coverage) is not passing",
      });
      return { answer: FRIENDLY_UNAVAILABLE_ERROR, sql: null };
    }

    let generatedSql: string;
    try {
      generatedSql = await this.generateSql(question);
    } catch (e: any) {
      const msg = `generateSql failed: ${e?.message ?? String(e)}`;
      this.logger.error(msg);
      await this.logAttempt({ factoryId, userId, question, generatedSql: null, rowCount: null, answer: null, errorMessage: msg });
      return { answer: FRIENDLY_GENERIC_ERROR, sql: null };
    }

    const validation = validateGeneratedSql(generatedSql);
    if (!validation.valid) {
      const msg = `Validation rejected generated SQL: ${validation.reason}`;
      this.logger.warn(msg);
      await this.logAttempt({
        factoryId,
        userId,
        question,
        generatedSql,
        rowCount: null,
        answer: null,
        errorMessage: msg,
      });
      return { answer: FRIENDLY_VALIDATION_ERROR, sql: null };
    }

    let rows: Record<string, unknown>[];
    try {
      rows = await this.executeScoped(factoryId, validation.sql);
    } catch (e: any) {
      const msg = `Execution failed: ${e?.message ?? String(e)}`;
      this.logger.error(msg);
      await this.logAttempt({
        factoryId,
        userId,
        question,
        generatedSql: validation.sql,
        rowCount: null,
        answer: null,
        errorMessage: msg,
      });
      return { answer: FRIENDLY_GENERIC_ERROR, sql: validation.sql };
    }

    let answer: string;
    try {
      answer = await this.formatAnswer(question, rows);
    } catch (e: any) {
      const msg = `formatAnswer failed: ${e?.message ?? String(e)}`;
      this.logger.error(msg);
      await this.logAttempt({
        factoryId,
        userId,
        question,
        generatedSql: validation.sql,
        rowCount: rows.length,
        answer: null,
        errorMessage: msg,
      });
      return { answer: FRIENDLY_GENERIC_ERROR, sql: validation.sql };
    }

    await this.logAttempt({
      factoryId,
      userId,
      question,
      generatedSql: validation.sql,
      rowCount: rows.length,
      answer,
      errorMessage: null,
    });
    return { answer, sql: validation.sql };
  }

  // Gemini call #1 — question + schema context in, one raw SQL string out.
  // Not live-testable in this environment (no API key present anywhere —
  // confirmed by the brief before this step started) but written correctly
  // against the official SDK.
  private async generateSql(question: string): Promise<string> {
    if (!this.genAI) {
      throw new Error("Gemini API key not configured (GEMINI_API_KEY/GOOGLE_API_KEY)");
    }
    const model = this.genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction:
        "You output ONLY a single SQL SELECT statement. No markdown code fences, no explanation, " +
        "no multiple statements. If you cannot safely or sensibly answer the question with a single " +
        "read-only SELECT against the described schema, output exactly: SELECT NULL WHERE FALSE",
    });
    const prompt = `${COPILOT_SCHEMA_CONTEXT}\n\nBusiness question: ${question}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    // Strip markdown fences defensively in case the model adds them anyway
    // — validation still runs on the result either way.
    return text.replace(/^```(?:sql)?\s*/i, "").replace(/```\s*$/, "").trim();
  }

  // Executes the validated SELECT through the stoneos_copilot_ro role, with
  // app.current_factory_id scoped to exactly this request via SET LOCAL
  // (via set_config(..., true), the parameterized equivalent — see below)
  // inside an explicit transaction. This is the single most important
  // correctness detail in this step: SET LOCAL is transaction-scoped and
  // resets automatically on COMMIT/ROLLBACK, so a pooled connection can
  // never leak one caller's factory scoping into the next request that
  // reuses it. A bare SET here would be a real cross-tenant bug, not a
  // hypothetical one — never change this to a bare SET.
  //
  // Uses SELECT set_config('app.current_factory_id', $1, true) rather than
  // string-interpolating `SET LOCAL app.current_factory_id = '...'`, because
  // Postgres's SET command does not accept bind parameters for its value —
  // set_config() is a normal function call and does, which is what keeps
  // factoryId (an authenticated value from @CurrentUser(), not raw user
  // input, but still good practice) out of raw SQL string interpolation.
  // This is the exact pattern Step 6A's own verification script
  // (scratchpad/smoke-test-copilot-rls.js) already proved works against
  // this same local Postgres instance.
  private async executeScoped(factoryId: string, sql: string): Promise<Record<string, unknown>[]> {
    if (!this.pool) {
      throw new Error("COPILOT_DATABASE_URL not configured");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      try {
        await client.query("SELECT set_config('app.current_factory_id', $1, true)", [factoryId]);
        await client.query("SET LOCAL statement_timeout = '5s'");
        const result = await client.query(sql);
        await client.query("COMMIT");
        return result.rows;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    } finally {
      client.release();
    }
  }

  // Gemini call #2 — question + structured query results in, a short
  // plain-language answer out. Also not live-testable this step (no key).
  private async formatAnswer(question: string, rows: Record<string, unknown>[]): Promise<string> {
    if (!this.genAI) {
      throw new Error("Gemini API key not configured (GEMINI_API_KEY/GOOGLE_API_KEY)");
    }
    const model = this.genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction:
        "You answer a business question in plain language, briefly and clearly, using ONLY the " +
        "structured query result data provided. If the result set is empty, say so plainly rather " +
        "than guessing. Do not mention SQL, tables, or columns in your answer — just the business answer.",
    });
    // Cap what's sent back for formatting — the row limit already bounds
    // this at 500, but keep the prompt itself well short of that in the
    // common case by summarizing count + a reasonable sample.
    const sample = rows.slice(0, 50);
    const prompt = `Question: ${question}\n\nQuery returned ${rows.length} row(s). Data (JSON, possibly truncated to first 50 rows):\n${JSON.stringify(sample)}`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  }

  private async logAttempt(input: LogAttemptInput): Promise<void> {
    try {
      await this.prisma.copilotQueryLog.create({
        data: {
          factoryId: input.factoryId,
          userId: input.userId,
          question: input.question,
          generatedSql: input.generatedSql ?? undefined,
          rowCount: input.rowCount ?? undefined,
          answer: input.answer ?? undefined,
          errorMessage: input.errorMessage ?? undefined,
        },
      });
    } catch (e: any) {
      // Logging must never be what makes /copilot/ask fail outright — but
      // a silently-dropped audit row for a security-adjacent feature is
      // worth a loud server log.
      this.logger.error(`Failed to write CopilotQueryLog: ${e?.message ?? String(e)}`);
    }
  }
}
