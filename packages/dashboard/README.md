# ADO Dashboard

Web dashboard for the Agentic Development Orchestrator (ADO).

## Features

- **Real-time Task Monitoring** - View active and completed tasks with live updates
- **Parallel Execution** - Monitor distributed worker pools and task parallelization
- **Provider Management** - Enable/disable AI coding agents
- **Cost Tracking** - Monitor API usage, costs, and optimization recommendations
- **Analytics** - Visualize task volume, provider usage, and performance trends
- **Settings** - Configure routing, HITL policies, quality gates, and notifications

## Pages

### Dashboard (Home)

Main overview with key metrics:
- Active tasks count
- Total cost (24h)
- Success rate
- Active providers
- Task volume trend (7-day chart)
- Recent tasks list

### Tasks

Task management interface:
- Task list with filters (status, provider)
- Real-time status updates
- Task search
- Task detail view with:
  - Execution timeline
  - Event stream
  - Cost breakdown
  - Output/errors

### Parallel Execution

Distributed worker pool monitoring (M9 feature):
- **Worker Statistics**:
  - Active/idle/busy workers
  - Worker utilization
  - Worker health status
- **Task Parallelization**:
  - Queued, running, completed tasks
  - Average task duration
  - Parallel execution efficiency
- **Cost Optimization**:
  - 24h cost tracking
  - 7-day cost projection
  - Cost savings from parallelization
  - Cost efficiency metrics
- **Merge Coordinator**:
  - Total merge operations
  - Auto-resolved vs. manual merges
  - Auto-resolution rate (target: 80%+)
- **Workload Distribution**:
  - Hourly workload chart
  - Worker utilization heatmap
  - Cost by tier breakdown
- **Recommendations**:
  - Worker scaling suggestions
  - Tier optimization
  - Estimated cost savings

### Providers

Provider management and configuration:
- Enable/disable providers
- Access mode configuration (subscription/API)
- Rate limit status
- Provider capabilities
- Usage statistics per provider

### Settings

Application settings:
- **Routing**: Subscription-first, API-first, cost-optimized
- **Checkpoints**: Auto-save, HITL thresholds
- **Quality Gates**: Build, test, lint, coverage requirements
- **Parallelization**: Max workers, cost strategy, autoscaling
- **Notifications**: Slack, email, webhook configuration
- **Telemetry**: OpenTelemetry settings
- **State**: Database configuration (SQLite/PostgreSQL)

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
VITE_API_URL=http://localhost:8080
```

## Tech Stack

- **React 18** - UI framework with concurrent features
- **TypeScript** - Full type safety
- **Vite** - Fast build tool with HMR
- **Tailwind CSS** - Utility-first styling
- **React Router** - Client-side routing
- **TanStack Query (React Query)** - Data fetching and caching
- **tRPC Client** - Type-safe API client
- **WebSocket** - Real-time updates
- **Recharts** - Data visualization (charts and graphs)
- **Lucide React** - Icon system

## API Integration

The dashboard connects to the ADO API server via tRPC and WebSocket.

### tRPC Client Setup

```typescript
import { createTRPCReact } from '@trpc/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wsLink } from '@trpc/client';
import type { AppRouter } from '@dxheroes/ado-api';

const trpc = createTRPCReact<AppRouter>();

// Configure tRPC client
const trpcClient = trpc.createClient({
  links: [
    wsLink({
      client: createWSClient({
        url: 'ws://localhost:4000',
      }),
    }),
  ],
});

const queryClient = new QueryClient();

function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Router />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Real-Time Updates

Tasks page uses WebSocket subscriptions for live updates:

```typescript
import { trpc } from './lib/trpc';

function TaskDetail({ taskId }: { taskId: string }) {
  // Subscribe to task progress
  trpc.task.onProgress.useSubscription(
    { taskId },
    {
      onData: (event) => {
        console.log('Task event:', event);
      },
    }
  );

  return <div>Task detail...</div>;
}
```

## Project Structure

```
packages/dashboard/
├── src/
│   ├── components/      # Reusable UI components
│   │   ├── Card.tsx
│   │   ├── StatCard.tsx
│   │   ├── TaskList.tsx
│   │   └── ...
│   ├── pages/           # Page components
│   │   ├── Dashboard.tsx
│   │   ├── Tasks.tsx
│   │   ├── TaskDetail.tsx
│   │   ├── ParallelExecution.tsx
│   │   ├── Providers.tsx
│   │   └── Settings.tsx
│   ├── lib/             # Utilities and configurations
│   │   ├── trpc.ts      # tRPC client
│   │   └── utils.ts
│   ├── App.tsx          # Root component
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles
├── public/              # Static assets
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## Screenshots

### Dashboard Overview
Real-time task monitoring with metrics and charts.

### Parallel Execution
Worker pool monitoring, cost optimization, and merge statistics.

### Task Detail
Detailed task execution view with event stream.

## Deployment

### Build for Production

```bash
# Build optimized bundle
pnpm build

# Output in dist/ directory
# - index.html
# - assets/ (JS, CSS, images)
```

### Deploy to Static Hosting

#### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

#### Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod --dir dist
```

#### Docker

```dockerfile
FROM node:22-alpine as build

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/dashboard/package.json ./packages/dashboard/
RUN pnpm install --frozen-lockfile

# Build
COPY packages/dashboard ./packages/dashboard
RUN pnpm --filter @dxheroes/ado-dashboard build

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/packages/dashboard/dist /usr/share/nginx/html
COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
# Build image
docker build -t ado-dashboard:latest -f packages/dashboard/Dockerfile .

# Run container
docker run -d -p 3000:80 ado-dashboard:latest
```

#### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ado-dashboard
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ado-dashboard
  template:
    metadata:
      labels:
        app: ado-dashboard
    spec:
      containers:
      - name: dashboard
        image: dxheroes/ado-dashboard:latest
        ports:
        - containerPort: 80
        env:
        - name: VITE_API_URL
          value: "http://ado-api:4000"
---
apiVersion: v1
kind: Service
metadata:
  name: ado-dashboard
spec:
  selector:
    app: ado-dashboard
  ports:
  - port: 80
    targetPort: 80
  type: LoadBalancer
```

### Environment Configuration

Create `.env.production`:

```env
VITE_API_URL=https://api.ado.example.com
```

Or use runtime configuration with `config.js`:

```javascript
// public/config.js
window.ADO_CONFIG = {
  apiUrl: 'https://api.ado.example.com',
};
```

## CLI Integration

Start dashboard from ADO CLI:

```bash
# Start dashboard on default port (3000)
ado dashboard

# Custom port
ado dashboard --port 8080

# Open browser automatically
ado dashboard --open

# Remote mode (connect to K8s API)
ado dashboard --remote
```

## Troubleshooting

### Dashboard won't start

```bash
# Check if port is in use
lsof -i :3000

# Try different port
pnpm dev --port 8080
```

### API connection errors

```bash
# Check API server is running
curl http://localhost:4000/health

# Verify environment variables
cat .env
```

### Build errors

```bash
# Clear cache and rebuild
rm -rf node_modules dist .vite
pnpm install
pnpm build
```

## Contributing

1. Follow React best practices
2. Use TypeScript for all components
3. Style with Tailwind CSS utilities
4. Keep components small and focused
5. Add PropTypes/TypeScript types
6. Test with Vitest + React Testing Library

## License

MIT © DX Heroes
