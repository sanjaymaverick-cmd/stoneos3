# Graph Report - .  (2026-07-13)

## Corpus Check
- 97 files · ~50,566 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 665 nodes · 1146 edges · 40 communities (30 shown, 10 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.85)
- Token cost: 171,429 input · 0 output

## Community Hubs (Navigation)
- Backend Controllers & Auth Guards
- Historical Backfill & Expense Module
- Sales Module (Orders, Customers, Summary)
- Production Module (DPR, Machines)
- Inventory & Cutting Session Services
- Frontend Pages & Shared Components
- Backend Dependencies (package.json)
- Three-Man-Team Process & Handoff Docs
- Frontend Dependencies (package.json)
- Tally Import Module
- Backend App Module & Vehicle Management
- Frontend TypeScript Config
- RawBlock Service (Recovery Ratio & Reconciliation)
- Cutting & Polishing Session Controllers
- Root Monorepo Package Config
- AWS Deployment Documentation
- Backend TypeScript Config
- App Layout & Auth Gate
- Damaged Slab Loss Smoke Test
- Dashboard Widgets Smoke Test
- Step 4 Dashboard Handoff
- Step 2 RawBlock Handoff
- Tally Parser Validation Script
- Nest CLI Config
- CI/CD Pipeline Docs
- Step 3 Damaged Slab Handoff
- Machine Seed Script
- Next.js Env Types
- Architect's Three Jobs
- AWS Amplify Alternative
- README API Reference
- README Expenses Module
- README Machines Module
- README Sales Module
- Reviewer's Never-Do List
- Reviewer's Review Scope

## God Nodes (most connected - your core abstractions)
1. `AuthenticatedUser` - 55 edges
2. `CurrentUser` - 52 edges
3. `PrismaService` - 49 edges
4. `ClerkAuthGuard` - 16 edges
5. `RawBlockService` - 15 edges
6. `safeGetToken()` - 15 edges
7. `apiFetch()` - 15 edges
8. `compilerOptions` - 15 edges
9. `PolishingSessionService` - 13 edges
10. `compilerOptions` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Parallel Isolated Worktree Build Technique` --semantically_similar_to--> `Anti-Drift Rules`  [INFERRED] [semantically similar]
  handoff/BUILD-LOG.md → ARCHITECT.md
- `RTK Token Optimization Tool` --semantically_similar_to--> `Architect Session Start Process`  [INFERRED] [semantically similar]
  new-setup.md → ARCHITECT.md
- `RDS PostgreSQL Setup (App Runner plan)` --conceptually_related_to--> `As-Built AWS ECS Fargate Infrastructure`  [INFERRED]
  AWS-DEPLOYMENT.md → deploy/README.md
- `Push Images to ECR` --conceptually_related_to--> `As-Built AWS ECS Fargate Infrastructure`  [INFERRED]
  AWS-DEPLOYMENT.md → deploy/README.md
- `StoneOS — Vedam Granites Pilot` --conceptually_related_to--> `Three Man Team Manifest`  [INFERRED]
  README.md → manifest.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three Man Team Roles (Arch, Bob, Richard)** — architect_arch, builder_bob, reviewer_richard, manifest_team [EXTRACTED 1.00]
- **Steps 5A-5D Parallel Isolated Worktree Build** — handoff_build_log_step5a, handoff_build_log_step5b, handoff_build_log_step5c, handoff_build_log_step5d, handoff_build_log_worktree_parallel_build [INFERRED 0.85]
- **App Runner Plan Superseded by ECS Fargate Deployment** — aws_deployment_app_runner_plan, deploy_readme_ecs_fargate_infra, changelog_aws_deployment_ecs, readme_stoneos [EXTRACTED 1.00]

## Communities (40 total, 10 thin omitted)

### Community 0 - "Backend Controllers & Auth Guards"
Cohesion: 0.08
Nodes (25): prisma, clerkClient, AuthenticatedUser, CurrentUser, Roles(), ClerkAuthGuard, Injectable, RolesGuard (+17 more)

### Community 1 - "Historical Backfill & Expense Module"
Cohesion: 0.06
Nodes (45): xlsx, buildMonthlyTotals(), CategoryHit, CONFIRM, DailyRecord, DATA_DIR, DPR_MONTHS, DprDayTotals (+37 more)

### Community 2 - "Sales Module (Orders, Customers, Summary)"
Cohesion: 0.06
Nodes (28): CustomerController, Body, Controller, Get, Post, UseGuards, CustomerService, Injectable (+20 more)

### Community 3 - "Production Module (DPR, Machines)"
Cohesion: 0.05
Nodes (28): DprController, Body, Controller, Get, Post, Query, UseGuards, DprService (+20 more)

### Community 4 - "Inventory & Cutting Session Services"
Cohesion: 0.06
Nodes (17): PrismaService, Injectable, SlabController, Body, Controller, Get, Param, Post (+9 more)

### Community 5 - "Frontend Pages & Shared Components"
Cohesion: 0.11
Nodes (29): AdminUsersPage(), ROLES, CategoryTotal, Dashboard(), ExpenseSummary, fmt(), isoDaysAgo(), isoToday() (+21 more)

### Community 6 - "Backend Dependencies (package.json)"
Cohesion: 0.05
Nodes (38): @clerk/backend, fast-xml-parser, @nestjs/cli, @nestjs/common, @nestjs/core, @nestjs/platform-express, dependencies, @clerk/backend (+30 more)

### Community 7 - "Three-Man-Team Process & Handoff Docs"
Cohesion: 0.08
Nodes (37): Anti-Drift Rules, Arch (Architect), Briefing Bob Process, Briefing Richard Process, The Deploy Gate, Architect Session Start Process, Version Check Mechanism, Before You Build / Builder Plan (+29 more)

### Community 8 - "Frontend Dependencies (package.json)"
Cohesion: 0.06
Nodes (34): autoprefixer, @clerk/nextjs, lucide-react, next, dependencies, @clerk/nextjs, lucide-react, next (+26 more)

### Community 9 - "Tally Import Module"
Cohesion: 0.09
Nodes (20): TallyImportController, Controller, Get, Post, Query, UseGuards, decodeTallyXml(), ParsedDaybook (+12 more)

### Community 10 - "Backend App Module & Vehicle Management"
Cohesion: 0.08
Nodes (21): AppModule, Module, bootstrap(), AdminModule, Module, ExpensesModule, Module, Body (+13 more)

### Community 11 - "Frontend TypeScript Config"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+18 more)

### Community 12 - "RawBlock Service (Recovery Ratio & Reconciliation)"
Cohesion: 0.12
Nodes (11): CreateRawBlockInput, ELEVATED_ROLES, ENTRY_SOURCES, EntrySource, RawBlockService, RECONCILE_FIELDS, ReconcileField, STARTING_STATES (+3 more)

### Community 13 - "Cutting & Polishing Session Controllers"
Cohesion: 0.18
Nodes (11): PolishingSessionService, Injectable, CuttingSessionController, PolishingSessionController, Body, Controller, Get, Param (+3 more)

### Community 14 - "Root Monorepo Package Config"
Cohesion: 0.10
Nodes (19): allowScripts, @nestjs/core@10.4.22, prisma@5.22.0, @prisma/client@5.22.0, @prisma/engines@5.22.0, sharp@0.34.5, name, overrides (+11 more)

### Community 15 - "AWS Deployment Documentation"
Cohesion: 0.16
Nodes (15): App Runner Deployment Plan (Superseded), Push Images to ECR, RDS PostgreSQL Setup (App Runner plan), One-time Local Smoke Test (App Runner plan), AWS Deployment on ECS Fargate (2026-07-09), Clerk Core 3 Upgrade, Production Docker Fixes, As-Built AWS ECS Fargate Infrastructure (+7 more)

### Community 16 - "Backend TypeScript Config"
Cohesion: 0.13
Nodes (14): compilerOptions, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, module, outDir (+6 more)

### Community 17 - "App Layout & Auth Gate"
Cohesion: 0.47
Nodes (3): metadata, AuthGate(), PUBLIC_PATHS

### Community 18 - "Damaged Slab Loss Smoke Test"
Cohesion: 0.47
Nodes (5): check(), computeDamagedSlabLoss(), main(), prisma, { PrismaClient }

### Community 19 - "Dashboard Widgets Smoke Test"
Cohesion: 0.47
Nodes (5): isoDaysAgo(), isoToday(), main(), prisma, { PrismaClient }

### Community 20 - "Step 4 Dashboard Handoff"
Cohesion: 0.40
Nodes (5): Database Migrations/Bootstrap Runbook, Step 4 — Owner/Admin Role-Based Dashboard, Review Feedback — Step 4, Auth + User Provisioning, Dashboard (Placeholder)

### Community 21 - "Step 2 RawBlock Handoff"
Cohesion: 0.50
Nodes (5): Step 2 — RawBlock Opening-Balance/Provenance, No Cross-Factory Transfer Decision, Review Feedback — Step 2 (Round 1 & 2), Inventory Module (raw blocks, slabs), Multi-tenant Enforcement (factory_id)

### Community 22 - "Tally Parser Validation Script"
Cohesion: 0.60
Nodes (4): decodeTallyXml(), fs, validateDaybook(), validateTrialBalance()

### Community 23 - "Nest CLI Config"
Cohesion: 0.50
Nodes (3): collection, $schema, sourceRoot

### Community 24 - "CI/CD Pipeline Docs"
Cohesion: 0.67
Nodes (3): Ongoing Deploys via GitHub Actions (App Runner plan), CI/CD Workflow Rewrite for ECS, CI/CD Workflow (GitHub OIDC)

### Community 25 - "Step 3 Damaged Slab Handoff"
Cohesion: 0.67
Nodes (3): Step 3 — Cost Allocation for Damaged Slabs, Review Feedback — Step 3, Production Module (block-centric)

## Ambiguous Edges - Review These
- `Dashboard (Placeholder)` → `Step 4 — Owner/Admin Role-Based Dashboard`  [AMBIGUOUS]
  README.md · relation: references

## Knowledge Gaps
- **174 isolated node(s):** `name`, `private`, `packages/backend`, `packages/frontend`, `dev:backend` (+169 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Dashboard (Placeholder)` and `Step 4 — Owner/Admin Role-Based Dashboard`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `PrismaService` connect `Inventory & Cutting Session Services` to `Backend Controllers & Auth Guards`, `Historical Backfill & Expense Module`, `Sales Module (Orders, Customers, Summary)`, `Production Module (DPR, Machines)`, `Tally Import Module`, `Backend App Module & Vehicle Management`, `RawBlock Service (Recovery Ratio & Reconciliation)`, `Cutting & Polishing Session Controllers`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `AuthenticatedUser` connect `Backend Controllers & Auth Guards` to `Historical Backfill & Expense Module`, `Sales Module (Orders, Customers, Summary)`, `Production Module (DPR, Machines)`, `Inventory & Cutting Session Services`, `Tally Import Module`, `Backend App Module & Vehicle Management`, `RawBlock Service (Recovery Ratio & Reconciliation)`, `Cutting & Polishing Session Controllers`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `CurrentUser` connect `Backend Controllers & Auth Guards` to `Historical Backfill & Expense Module`, `Sales Module (Orders, Customers, Summary)`, `Production Module (DPR, Machines)`, `Inventory & Cutting Session Services`, `Tally Import Module`, `Backend App Module & Vehicle Management`, `Cutting & Polishing Session Controllers`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **What connects `name`, `private`, `packages/backend` to the rest of the system?**
  _174 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend Controllers & Auth Guards` be split into smaller, more focused modules?**
  _Cohesion score 0.08306010928961749 - nodes in this community are weakly interconnected._
- **Should `Historical Backfill & Expense Module` be split into smaller, more focused modules?**
  _Cohesion score 0.05844155844155844 - nodes in this community are weakly interconnected._