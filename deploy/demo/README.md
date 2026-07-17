# StoneOS — Demo environment (isolated)

A **separate, partner-facing demo** of StoneOS that stands entirely apart from
the live production deployment. It has its own ECR repos, cluster, services,
ALB, and database — **nothing here can affect prod.**

Two things make it demo-friendly:

- **No sign-in wall.** `DEMO_MODE=true` (backend) + `NEXT_PUBLIC_DEMO_MODE=true`
  (frontend build) let partners land straight in the app as a fixed
  **read-only owner** on one seeded factory. Only `GET`s and the read-only
  Copilot ask endpoint are allowed — partners can look, not mutate.
- **Representative seeded data.** `packages/backend/prisma/seed-demo.ts`
  populates Vedam Granites sample data so every page shows something real.

The **Copilot** works without a Gemini key via built-in canned answers over the
seeded data (`src/modules/copilot/copilot-demo-answers.ts`). Set a real
`GEMINI_API_KEY` in the demo backend task def to run the live text-to-SQL path.

> ⚠️ Never set `DEMO_MODE=true` on the production deployment — it disables
> Clerk auth. Demo mode lives only in this isolated environment.

---

## What differs from prod

| | Prod (`deploy/`) | Demo (`deploy/demo/`) |
|---|---|---|
| ECR repos | `stoneos-backend`, `stoneos-frontend` | `stoneos-demo-backend`, `stoneos-demo-frontend` |
| ECS cluster | `stoneos-cluster` | `stoneos-demo-cluster` |
| Services | `stoneos-{backend,frontend}-svc` | `stoneos-demo-{backend,frontend}-svc` |
| Task def families | `stoneos-{backend,frontend}` | `stoneos-demo-{backend,frontend}` |
| Database | `stoneos-db` (RDS) | separate DB — a new `stoneos_demo` database (own RDS instance, or a separate DB on the existing instance) |
| Auth | real Clerk sessions | `DEMO_MODE` read-only owner |
| Workflow | `.github/workflows/deploy.yml` | `.github/workflows/deploy-demo.yml` |

---

## One-time setup (needs broader AWS access than the deploy role)

The `stoneos-github-deploy` OIDC role can only push to the two prod ECR repos
and update the two prod services (see `deploy/iam/github-deploy-policy.json`).
Creating the demo resources below is a one-time admin action (Console, CLI, or
IaC) done with an account/role that can create infra:

1. **ECR repos:** `stoneos-demo-backend`, `stoneos-demo-frontend`.
2. **Database:** create a `stoneos_demo` database (a fresh `db.t4g.micro` RDS,
   or a separate database on the existing instance). Store its URL at SSM
   param `/stoneos-demo/database-url` (SecureString).
3. **CloudWatch log groups:** `/ecs/stoneos-demo-backend`,
   `/ecs/stoneos-demo-frontend`.
4. **Register task defs** from `deploy/demo/backend-taskdef.json` and
   `frontend-taskdef.json` (fill the `REPLACE-WITH-DEMO-ALB-DNS` placeholder
   after step 6).
5. **ECS cluster** `stoneos-demo-cluster` + two Fargate services
   (`stoneos-demo-backend-svc` :4000, `stoneos-demo-frontend-svc` :3000).
6. **ALB** `stoneos-demo-alb` with listeners `:80 → frontend TG`,
   `:8080 → backend TG` (mirrors prod). Note its DNS name.
7. **Widen the deploy role:** attach
   `deploy/demo/github-deploy-demo-policy.json` to `stoneos-github-deploy`
   (or a dedicated demo role referenced in `deploy-demo.yml`).
8. **Repo variables** (Settings → Actions → Variables):
   - `DEMO_NEXT_PUBLIC_API_URL` = `http://<demo-alb-dns>:8080`
   - `DEMO_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = any `pk_...` (a dev key is fine)

## Migrate + seed the demo database

Run once (and re-run the seed anytime to reset the demo data — it wipes and
re-inserts only the demo factory):

```bash
DATABASE_URL="postgresql://stoneos:<pw>@<demo-db-host>:5432/stoneos_demo" \
  npx prisma migrate deploy --schema=packages/backend/prisma/schema.prisma

DATABASE_URL="postgresql://stoneos:<pw>@<demo-db-host>:5432/stoneos_demo" \
  npx ts-node packages/backend/prisma/seed-demo.ts
```

No Clerk bootstrap is needed — demo mode doesn't use Clerk users.

## Deploy

Rename `.github/workflows/deploy-demo.yml.disabled` → `deploy-demo.yml`, then
push to `claude/stone-os-demo-deployment-ayggyb` (or run it via
**workflow_dispatch**). It builds the demo images (frontend with
`NEXT_PUBLIC_DEMO_MODE=true`), pushes them, and force-deploys both demo
services.

## Partner access

Send partners the demo ALB URL: `http://<demo-alb-dns>` — they land directly on
the Dashboard, no login. (HTTPS + a friendly domain is the same hardening step
noted for prod.)

## Verify after deploy

- `GET http://<demo-alb-dns>:8080/raw-blocks` → returns seeded blocks (200).
- `POST http://<demo-alb-dns>:8080/sales-orders` → `403` "read-only demo".
- Open `http://<demo-alb-dns>` → Dashboard renders with data; **Copilot** tab
  answers the sample questions.
