# Lambda Pulse - AWS Lambda Monitoring Platform

A professional, real-time AWS Lambda monitoring platform for companies to track their clients' Lambda function performance, costs, and logs.

## 🚀 Features

### For Admins
- **Integration Management**: Configure AWS Lambda functions with encrypted credentials
- **Client Management**: Create client accounts with restricted access
- **Audit Trail**: Complete activity logging for compliance and security
- **Multi-tenant**: Support for multiple companies in a single deployment

### For Clients
- **Real-time Metrics**: Invocations, error rates, duration analytics
- **Cost Estimation**: AWS Lambda pricing calculations based on actual usage
- **Performance Charts**: Line and bar charts for trend analysis
- **Log Filtering**: Search and filter logs by type (errors, reports, all)

## 🏗️ Architecture

```
├── backend/                 # Express.js API Server
│   ├── routes/              # API endpoints (auth, lambda, audit)
│   ├── db/                  # PostgreSQL schemas and queries
│   ├── cache/               # Redis caching layer
│   ├── security/            # AES-256 encryption for AWS credentials
│   ├── audit/               # Activity logging
│   └── email/               # Resend integration for password reset
│
├── frontend/                # Vue 3 + TypeScript SPA
│   ├── src/
│   │   ├── views/           # Page components (Dashboard, Admin, Auth)
│   │   ├── stores/          # Pinia state management
│   │   ├── composables/     # Reusable logic (useApi)
│   │   ├── types/           # TypeScript interfaces
│   │   └── assets/          # Styles and logos
│   └── nixpacks.toml        # Easypanel deployment config
```

## 📋 Prerequisites

- **Node.js** 20.x or 22.x
- **PostgreSQL** 14+
- **Redis** 6+
- **Resend** account (for email)
- **AWS IAM** credentials with CloudWatch/Lambda read access

## ⚙️ Environment Setup

### Backend (`backend/.env`)

```bash
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:password@host:5432/lambda_client

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7

# Password Reset
RESET_TOKEN_TTL_MINUTES=30
FRONTEND_BASE_URL=https://your-frontend-domain.com

# Encryption (64 hex chars)
ENCRYPTION_KEY=your-64-char-hex-key

# Email (Resend)
RESEND_API_KEY=re_your_api_key
RESEND_FROM=Lambda Monitor <noreply@yourdomain.com>
```

### Frontend (`frontend/.env`)

```bash
VITE_API_BASE_URL=https://your-backend-domain.com
```

## 🗄️ Database Setup

```bash
# Connect to PostgreSQL and run:
psql -d lambda_client -f backend/db/schema.sql

# Create first admin user:
cd backend
node scripts/create-user.js - "admin@example.com" "SecurePassword123" admin
```

## 🔐 AWS IAM Policy

Create an IAM user with this minimal policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "lambda:ListFunctions",
                "lambda:GetFunction",
                "cloudwatch:GetMetricData",
                "logs:FilterLogEvents",
                "logs:DescribeLogGroups"
            ],
            "Resource": "*"
        }
    ]
}
```

## 🚀 Deployment (Easypanel + Nixpacks)

### Backend

1. Create a new app in Easypanel
2. Connect to your Git repository
3. Set the root directory to `backend`
4. Add environment variables
5. Deploy (Nixpacks will auto-detect)

### Frontend

1. Create a new app in Easypanel
2. Connect to the same repository
3. Set the root directory to `frontend`
4. Add `VITE_API_BASE_URL` environment variable
5. Deploy

### Nixpacks Configuration

Both projects include `nixpacks.toml` for automatic build configuration:

**Backend** - Runs `node server.js` with production dependencies only
**Frontend** - Builds Vue app and serves with `serve`

## 🧪 Local Development

```bash
# Backend
cd backend
npm install
cp .env.example .env  # Edit with your values
npm run dev

# Frontend (new terminal)
cd frontend
npm install
cp .env.example .env  # Edit with your values
npm run dev
```

## 📊 API Endpoints

### Authentication
- `POST /auth/login` - Client login (requires company)
- `POST /auth/admin/login` - Admin login
- `POST /auth/logout` - Logout
- `POST /auth/password/forgot` - Request password reset
- `POST /auth/password/reset` - Reset password
- `GET /auth/me` - Get current user
- `GET /auth/clients` - List client users (admin only)
- `POST /auth/clients` - Create client user (admin only)

### Lambda Integrations
- `GET /lambda/integrations` - List user's integrations
- `POST /lambda/integrations` - Create integration (admin only)
- `DELETE /lambda/integrations/:id` - Delete integration (admin only)
- `GET /lambda/functions/:integrationId` - List Lambda functions
- `GET /lambda/metrics/:integrationId` - Get CloudWatch metrics
- `GET /lambda/logs/:integrationId` - Get CloudWatch logs

### Audit
- `GET /audit/logs` - Get audit logs (admin only)

## 🔒 Security Features

- **JWT** with short-lived access tokens (15m)
- **AES-256-GCM** encryption for AWS credentials at rest
- **bcrypt** password hashing
- **CORS** protection
- **Audit logging** for all sensitive operations
- **Redis caching** with TTL to prevent API abuse

## 📝 Tech Stack

### Backend
- Express.js 5
- PostgreSQL with `pg` driver
- Redis for caching
- AWS SDK v3 (Lambda, CloudWatch, CloudWatch Logs)
- bcryptjs, jsonwebtoken
- Resend for transactional emails

### Frontend
- Vue 3.5 with Composition API
- TypeScript 5.9
- Pinia 3 for state management
- Vue Router 4
- Chart.js 4 + vue-chartjs
- Tailwind CSS 4

## 📄 License

MIT License - See LICENSE file for details.
