# ADO Dashboard

Web dashboard for the Agentic Development Orchestrator (ADO).

## Features

- **Real-time task monitoring** - View active and completed tasks
- **Provider management** - Enable/disable AI coding agents
- **Cost tracking** - Monitor API usage and costs
- **Analytics** - Visualize task volume and provider usage trends
- **Settings** - Configure routing, HITL policies, and notifications

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

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Router** - Routing
- **TanStack Query** - Data fetching
- **Recharts** - Data visualization
- **Lucide React** - Icons
