# StoneOS — AWS deployment (ECS Fargate)

This is the **as-built** infrastructure for the live deployment, in
`ap-south-1`, account `REDACTED-AWS-ACCOUNT-ID`. It supersedes the App Runner plan
in the repo-root `AWS-DEPLOYMENT.md` (App Runner was not available on
this account — `SubscriptionRequiredException` — so we run on ECS
Fargate behind an ALB instead).

## Live URLs

| What        | URL                                                            |
| ----------- | -------------------------------------------------------------- |
| Frontend    | `http://stoneos-alb-337796168.ap-south-1.elb.amazonaws.com`    |
| Backend API | `http://stoneos-alb-337796168.ap-south-1.elb.amazonaws.com:8080` |

> HTTP only. A custom domain + ACM cert + HTTPS listener is the main
> remaining hardening step before real production use.

## Architecture

```
                 Internet
                    │
        ┌───────────┴───────────┐
        │   ALB (stoneos-alb)   │
        │  :80  → frontend TG   │
        │  :8080 → backend TG   │
        └───────┬───────┬───────┘
                │       │
     ┌──────────▼─┐   ┌─▼──────────┐
     │ frontend   │   │ backend    │   ECS Fargate (stoneos-cluster)
     │ svc :3000  │   │ svc :4000  │
     └────────────┘   └─────┬──────┘
                            │ 5432
                      ┌─────▼──────┐
                      │ RDS        │  stoneos-db (Postgres 16, private)
                      └────────────┘
```

## Resources

| Type            | Name / ID                                             |
| --------------- | ----------------------------------------------------- |
| RDS             | `stoneos-db` (Postgres 16, `db.t4g.micro`, private)   |
| ECR repos       | `stoneos-backend`, `stoneos-frontend`                 |
| ECS cluster     | `stoneos-cluster` (Fargate)                           |
| ECS services    | `stoneos-backend-svc`, `stoneos-frontend-svc`         |
| ALB             | `stoneos-alb` (internet-facing)                       |
| Target groups   | `stoneos-backend-tg` (4000), `stoneos-frontend-tg` (3000) |
| Log groups      | `/ecs/stoneos-backend`, `/ecs/stoneos-frontend`       |
| Task exec role  | `ecsTaskExecutionRole` (+ inline `stoneos-ssm-read`)  |
| CI deploy role  | `stoneos-github-deploy` (GitHub OIDC)                 |

### Security groups

- **ALB SG** (`sg-0dace...`): inbound `80` and `8080` from `0.0.0.0/0`.
- **ECS tasks SG** (`sg-03beb...`): inbound `3000`/`4000` from the ALB SG only.
- **RDS SG** (`sg-0e77f...`, the VPC default): inbound `5432` from the ECS tasks SG only.

## Secrets

Runtime secrets are in **SSM Parameter Store** as `SecureString`, never
in task definitions or git:

- `/stoneos/database-url`
- `/stoneos/clerk-secret-key`

The task definitions (`backend-taskdef.json`) reference these by ARN
under `secrets`; the `ecsTaskExecutionRole` has an inline policy
(`iam/ecs-execution-ssm-read-policy.json`) allowing `ssm:GetParameters`
+ `kms:Decrypt` on them.

The frontend's `NEXT_PUBLIC_*` values are **build-time** args baked into
the image. Both are public by design (a Clerk *publishable* key and the
public ALB URL), so CI keeps them in repo **variables**, not secrets.

## CI/CD (`.github/workflows/deploy.yml`)

On push to `main` (or manual `workflow_dispatch`):

1. Assume `stoneos-github-deploy` via **GitHub OIDC** — no long-lived
   AWS keys are stored in GitHub.
2. Build + push both images to ECR (tagged `:latest` and `:<sha>`).
3. `aws ecs update-service --force-new-deployment` on both services
   (task defs point at `:latest`, so this pulls the new image).
4. Wait for both services to stabilize.

### Required GitHub repo *variables* (Settings → Secrets and variables → Actions → Variables)

| Variable                            | Value                                                         |
| ----------------------------------- | ------------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`               | `http://stoneos-alb-337796168.ap-south-1.elb.amazonaws.com:8080` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | your `pk_...` Clerk publishable key                          |

No repo *secrets* are required — AWS auth is OIDC, and the two variables
above are public values.

## Database migrations / bootstrap

Migrations are **not** run by CI (the app connects to a private RDS the
runner can't reach). Run them from inside the VPC, or temporarily expose
RDS to your IP:

```bash
# schema
DATABASE_URL="postgresql://stoneos:<pw>@<rds-endpoint>:5432/stoneos" \
  npx prisma migrate deploy --schema=packages/backend/prisma/schema.prisma

# first owner + factory + machines (one-time)
OWNER_EMAIL=you@example.com \
DATABASE_URL="postgresql://stoneos:<pw>@<rds-endpoint>:5432/stoneos" \
CLERK_SECRET_KEY=<sk_...> \
  npx ts-node packages/backend/prisma/bootstrap.ts
```

## Known follow-ups

- HTTPS + custom domain (ACM cert, HTTPS listener, redirect 80→443).
- Move Clerk from dev keys (`pk_test`/`sk_test`) to live keys.
- RDS backup retention is `1` day (free-tier cap) — raise it off free tier.
- Add a real `/health` endpoint (currently the backend TG accepts 200/401/404).
