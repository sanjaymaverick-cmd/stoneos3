# Deploying StoneOS to AWS

Assumes: AWS CLI v2 configured (`aws configure`), Docker installed, and
you're logged into an AWS account with permission to create RDS/ECR/App
Runner/IAM resources. Replace `<...>` placeholders with your real values.

Recommended path: **App Runner for both backend and frontend** (both are
containerized, App Runner deploys straight from an ECR image — simplest
ops for a small team, no load balancer/task definitions to hand-manage
like ECS Fargate requires). Amplify Hosting is a valid alternative for
the frontend specifically if you'd rather not containerize it — skip
straight to "Amplify alternative" at the bottom if so.

---

## 0. One-time smoke test (do this first, costs nothing)

Before touching AWS at all, prove the production images actually work:

```bash
cd stoneos
cp .env.example .env   # fill in CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
docker compose -f docker-compose.prod.yml up --build
```

Visit http://localhost:3000. If this doesn't work, nothing downstream will either —
fix it here where iteration is fast and free.

---

## 1. RDS PostgreSQL

```bash
aws rds create-db-instance \
  --db-instance-identifier stoneos-db \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --engine-version 16 \
  --master-username stoneos \
  --master-user-password '<CHOOSE_A_STRONG_PASSWORD>' \
  --allocated-storage 20 \
  --publicly-accessible false \
  --vpc-security-group-ids <YOUR_SECURITY_GROUP_ID> \
  --backup-retention-period 7
```

`db.t4g.micro` is fine for one factory's worth of data — this isn't a
high-throughput workload. Wait for it to become available:

```bash
aws rds wait db-instance-available --db-instance-identifier stoneos-db
aws rds describe-db-instances --db-instance-identifier stoneos-db \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

Save that endpoint — it's the host part of `DATABASE_URL`.

**Security group note:** RDS needs to accept inbound Postgres (5432) from
wherever App Runner runs. App Runner's VPC connector setup is the fiddly
part here — the straightforward option is putting RDS in the same VPC
and using an App Runner VPC Connector (see step 3).

---

## 2. Push images to ECR

```bash
export AWS_ACCOUNT_ID=<your account id>
export AWS_REGION=<your region, e.g. ap-south-1>

aws ecr create-repository --repository-name stoneos-backend
aws ecr create-repository --repository-name stoneos-frontend

aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Backend
docker build -t stoneos-backend ./packages/backend
docker tag stoneos-backend:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/stoneos-backend:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/stoneos-backend:latest

# Frontend — NEXT_PUBLIC_* vars are baked in at BUILD time, so they must
# be correct here, not just set later as runtime env vars on App Runner.
docker build -t stoneos-frontend ./packages/frontend \
  --build-arg NEXT_PUBLIC_API_URL=https://<your-backend-app-runner-url> \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<your clerk publishable key>
docker tag stoneos-frontend:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/stoneos-frontend:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/stoneos-frontend:latest
```

Notice the chicken-and-egg: the frontend build needs the backend's URL,
but you won't have that until the backend's App Runner service exists.
Deploy the backend first (step 3), grab its URL, then build/push the
frontend image.

---

## 3. App Runner — backend

Console is genuinely easier than CLI for App Runner's VPC connector setup
(step through: App Runner → Create service → Container registry → pick
the `stoneos-backend` ECR image → port 4000). Key settings:

- **VPC connector**: create one pointing at the same VPC/subnets as your
  RDS instance, so the backend can actually reach the database.
- **Environment variables**: `DATABASE_URL` (using the RDS endpoint from
  step 1), `CLERK_SECRET_KEY`, `FRONTEND_URL` (fill in after step 4),
  `PORT=4000`.
- **Health check path**: none configured in the app yet — use `/` (NestJS
  will 404 on it, which is still a valid "the server responded" signal
  for App Runner's default TCP-based check, or add a real `/health`
  endpoint if you want an HTTP check specifically).

Once live, run the migration and bootstrap against the real database
from your own machine (temporarily allow your IP in the RDS security
group, or run these from an EC2/Cloud9 instance inside the VPC):

```bash
DATABASE_URL="postgresql://stoneos:<password>@<rds-endpoint>:5432/stoneos" \
  npx prisma migrate deploy --schema=packages/backend/prisma/schema.prisma

OWNER_EMAIL=you@example.com \
DATABASE_URL="postgresql://stoneos:<password>@<rds-endpoint>:5432/stoneos" \
CLERK_SECRET_KEY=<your clerk secret key> \
  npx ts-node packages/backend/prisma/bootstrap.ts
```

---

## 4. App Runner — frontend

Same console flow, pointing at `stoneos-frontend`, port 3000. This one
doesn't need the VPC connector (it only talks to the backend over the
public internet via `NEXT_PUBLIC_API_URL`, already baked into the image).

Once you have this URL, go back and set `FRONTEND_URL` on the backend
service to it (for CORS), and rebuild the frontend image with the
correct `NEXT_PUBLIC_API_URL` if you used a placeholder earlier.

---

## 5. Ongoing deploys (GitHub Actions)

See `.github/workflows/deploy.yml` — builds and pushes both images to
ECR on every push to `main`, then triggers an App Runner redeploy.
Requires these repo secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_ACCOUNT_ID`, `AWS_REGION`, `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

---

## Amplify alternative (frontend only)

If you'd rather not containerize the frontend: `amplify init` in
`packages/frontend`, connect your repo, Amplify handles Next.js SSR
natively (build settings auto-detected). Skip the frontend Dockerfile
and App Runner steps above entirely. Backend still needs App Runner (or
ECS) regardless, since it's not a static/SSR-only Next.js app.

---

## Cost sanity check

`db.t4g.micro` RDS + two small App Runner services (1 vCPU / 2GB each,
scale-to-zero-adjacent pricing) should land under $50-70/month for one
factory's traffic. Watch RDS storage growth and App Runner's
provisioned-vs-active pricing if usage patterns turn out spikier than
expected.
