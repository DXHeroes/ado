import { Activity, AlertCircle, Cpu, DollarSign, GitMerge, Server, TrendingUp, Zap } from 'lucide-react';
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { Card } from '../components/Card';

// Mock data - in real implementation, this would come from API
const mockParallelStats = {
	workers: {
		active: 12,
		idle: 3,
		busy: 9,
		total: 15,
		utilization: 0.6,
	},
	tasks: {
		queued: 24,
		running: 9,
		completed: 156,
		failed: 3,
		avgDuration: 45,
	},
	costs: {
		current24h: 12.45,
		projected7d: 87.15,
		savings: 23.5,
		efficiency: 8.2,
	},
	merges: {
		total: 45,
		autoResolved: 38,
		manualRequired: 7,
		autoResolutionRate: 84,
	},
	workload: [
		{ hour: '00:00', load: 0.2 },
		{ hour: '04:00', load: 0.15 },
		{ hour: '08:00', load: 0.6 },
		{ hour: '12:00', load: 0.85 },
		{ hour: '16:00', load: 0.75 },
		{ hour: '20:00', load: 0.4 },
	],
	workerStatus: [
		{ name: 'worker-1', status: 'busy', utilization: 0.92, cost: 1.2 },
		{ name: 'worker-2', status: 'busy', utilization: 0.88, cost: 1.2 },
		{ name: 'worker-3', status: 'busy', utilization: 0.76, cost: 1.2 },
		{ name: 'worker-4', status: 'idle', utilization: 0.12, cost: 1.2 },
		{ name: 'worker-5', status: 'idle', utilization: 0.08, cost: 1.2 },
	],
	costByTier: [
		{ tier: 'Low', cost: 2.4, count: 5 },
		{ tier: 'Medium', cost: 6.8, count: 7 },
		{ tier: 'High', cost: 3.25, count: 3 },
	],
	recommendations: [
		{
			type: 'reduce-workers',
			priority: 4,
			description: '2 workers are underutilized (<30%). Consider scaling down.',
			estimatedSavings: 28.8,
		},
		{
			type: 'change-tier',
			priority: 5,
			description: 'High-tier workers underutilized. Downgrade to medium-tier.',
			estimatedSavings: 15.6,
		},
	],
};

export function ParallelExecution() {
	// In real implementation, these would be real API calls
	const stats = mockParallelStats;

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Parallel Execution</h1>
				<p className="text-muted-foreground">Monitor distributed worker pools and task parallelization</p>
			</div>

			{/* Stats Grid */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<StatCard
					title="Active Workers"
					value={`${stats.workers.active}/${stats.workers.total}`}
					icon={Server}
					trend={`${(stats.workers.utilization * 100).toFixed(0)}% utilized`}
					trendUp={stats.workers.utilization > 0.5}
				/>
				<StatCard
					title="Tasks Queued"
					value={stats.tasks.queued}
					icon={Activity}
					trend={`${stats.tasks.running} running`}
					trendUp={stats.tasks.running > 0}
				/>
				<StatCard
					title="Cost (24h)"
					value={`$${stats.costs.current24h.toFixed(2)}`}
					icon={DollarSign}
					trend={`${stats.costs.savings.toFixed(1)}% saved`}
					trendUp={true}
				/>
				<StatCard
					title="Auto-Merge Rate"
					value={`${stats.merges.autoResolutionRate}%`}
					icon={GitMerge}
					trend={`${stats.merges.autoResolved}/${stats.merges.total} resolved`}
					trendUp={stats.merges.autoResolutionRate > 80}
				/>
			</div>

			{/* Worker Pool Status */}
			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<div className="p-6">
						<h3 className="text-lg font-semibold mb-4">Worker Pool Status</h3>
						<div className="space-y-3">
							{stats.workerStatus.map((worker) => (
								<div
									key={worker.name}
									className="flex items-center justify-between p-3 rounded-lg border"
								>
									<div className="flex items-center gap-3">
										<div
											className={`h-3 w-3 rounded-full ${
												worker.status === 'busy' ? 'bg-green-500' : 'bg-gray-300'
											}`}
										/>
										<span className="font-medium">{worker.name}</span>
										<span
											className={`px-2 py-0.5 text-xs rounded ${
												worker.status === 'busy'
													? 'bg-green-100 text-green-700'
													: 'bg-gray-100 text-gray-700'
											}`}
										>
											{worker.status}
										</span>
									</div>
									<div className="flex items-center gap-4 text-sm">
										<span className="text-muted-foreground">
											{(worker.utilization * 100).toFixed(0)}%
										</span>
										<span className="text-muted-foreground">${worker.cost.toFixed(2)}/hr</span>
									</div>
								</div>
							))}
						</div>
					</div>
				</Card>

				<Card>
					<div className="p-6">
						<h3 className="text-lg font-semibold mb-4">Cost by Worker Tier</h3>
						<ResponsiveContainer width="100%" height={250}>
							<PieChart>
								<Pie
									data={stats.costByTier}
									dataKey="cost"
									nameKey="tier"
									cx="50%"
									cy="50%"
									outerRadius={80}
									label={(entry) => `${entry.tier}: $${entry.cost.toFixed(2)}`}
								>
									{stats.costByTier.map((_entry, index) => (
										<Cell
											key={`cell-${index}`}
											fill={['#3b82f6', '#10b981', '#f59e0b'][index]}
										/>
									))}
								</Pie>
								<Tooltip />
							</PieChart>
						</ResponsiveContainer>
					</div>
				</Card>
			</div>

			{/* Workload Pattern */}
			<Card>
				<div className="p-6">
					<h3 className="text-lg font-semibold mb-4">Workload Pattern (24h)</h3>
					<ResponsiveContainer width="100%" height={300}>
						<LineChart data={stats.workload}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="hour" />
							<YAxis domain={[0, 1]} tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
							<Tooltip formatter={(value) => `${((value as number) * 100).toFixed(0)}%`} />
							<Line type="monotone" dataKey="load" stroke="#3b82f6" strokeWidth={2} />
						</LineChart>
					</ResponsiveContainer>
				</div>
			</Card>

			{/* Cost Optimization Recommendations */}
			<Card>
				<div className="p-6">
					<h3 className="text-lg font-semibold mb-4">Cost Optimization Recommendations</h3>
					<div className="space-y-3">
						{stats.recommendations.map((rec, index) => (
							<div
								key={index}
								className="flex items-start gap-3 rounded-lg border p-4 hover:bg-gray-50 transition-colors"
							>
								<div
									className={`mt-1 px-2 py-1 text-xs font-medium rounded ${
										rec.priority >= 4
											? 'bg-red-100 text-red-700'
											: 'bg-yellow-100 text-yellow-700'
									}`}
								>
									P{rec.priority}
								</div>
								<div className="flex-1">
									<p className="font-medium">{rec.description}</p>
									<p className="text-sm text-muted-foreground mt-1">
										Estimated savings: ${rec.estimatedSavings.toFixed(2)}/day
									</p>
								</div>
								<button className="px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded">
									Apply
								</button>
							</div>
						))}
					</div>
				</div>
			</Card>

			{/* Task Distribution */}
			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<div className="p-6">
						<h3 className="text-lg font-semibold mb-4">Task Status Distribution</h3>
						<ResponsiveContainer width="100%" height={250}>
							<BarChart
								data={[
									{ status: 'Completed', count: stats.tasks.completed, fill: '#10b981' },
									{ status: 'Running', count: stats.tasks.running, fill: '#3b82f6' },
									{ status: 'Queued', count: stats.tasks.queued, fill: '#f59e0b' },
									{ status: 'Failed', count: stats.tasks.failed, fill: '#ef4444' },
								]}
							>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="status" />
								<YAxis />
								<Tooltip />
								<Bar dataKey="count">
									{[
										{ status: 'Completed', count: stats.tasks.completed, fill: '#10b981' },
										{ status: 'Running', count: stats.tasks.running, fill: '#3b82f6' },
										{ status: 'Queued', count: stats.tasks.queued, fill: '#f59e0b' },
										{ status: 'Failed', count: stats.tasks.failed, fill: '#ef4444' },
									].map((entry, index) => (
										<Cell key={`cell-${index}`} fill={entry.fill} />
									))}
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					</div>
				</Card>

				<Card>
					<div className="p-6">
						<h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
						<div className="space-y-4">
							<MetricRow
								label="Avg Task Duration"
								value={`${stats.tasks.avgDuration}s`}
								icon={Zap}
							/>
							<MetricRow
								label="Cost Efficiency"
								value={`${stats.costs.efficiency.toFixed(1)} tasks/$`}
								icon={TrendingUp}
							/>
							<MetricRow
								label="Worker Utilization"
								value={`${(stats.workers.utilization * 100).toFixed(0)}%`}
								icon={Cpu}
							/>
							<MetricRow
								label="Auto-Merge Rate"
								value={`${stats.merges.autoResolutionRate}%`}
								icon={GitMerge}
							/>
						</div>
					</div>
				</Card>
			</div>

			{/* Merge Conflicts */}
			{stats.merges.manualRequired > 0 && (
				<Card>
					<div className="p-6">
						<h3 className="text-lg font-semibold mb-4">Pending Merge Conflicts</h3>
						<div className="space-y-2">
							{Array.from({ length: stats.merges.manualRequired }).map((_, i) => (
								<div
									key={i}
									className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3"
								>
									<AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
									<div className="flex-1">
										<p className="font-medium text-sm">
											Conflict in worker-{i + 1} requires manual resolution
										</p>
										<p className="text-xs text-muted-foreground mt-1">
											High-risk file: security/auth.ts
										</p>
									</div>
									<button className="px-3 py-1 text-sm font-medium text-orange-600 hover:bg-orange-100 rounded">
										Review
									</button>
								</div>
							))}
						</div>
					</div>
				</Card>
			)}
		</div>
	);
}

interface StatCardProps {
	title: string;
	value: string | number;
	icon: React.ComponentType<{ className?: string }>;
	trend?: string;
	trendUp?: boolean;
}

function StatCard({ title, value, icon: Icon, trend, trendUp }: StatCardProps) {
	return (
		<Card>
			<div className="p-6">
				<div className="flex items-center justify-between">
					<p className="text-sm font-medium text-muted-foreground">{title}</p>
					<Icon className="h-4 w-4 text-muted-foreground" />
				</div>
				<div className="mt-2">
					<p className="text-2xl font-bold">{value}</p>
					{trend && (
						<p className={`text-xs ${trendUp ? 'text-green-600' : 'text-yellow-600'}`}>{trend}</p>
					)}
				</div>
			</div>
		</Card>
	);
}

interface MetricRowProps {
	label: string;
	value: string;
	icon: React.ComponentType<{ className?: string }>;
}

function MetricRow({ label, value, icon: Icon }: MetricRowProps) {
	return (
		<div className="flex items-center justify-between p-3 rounded-lg border">
			<div className="flex items-center gap-3">
				<Icon className="h-5 w-5 text-muted-foreground" />
				<span className="text-sm font-medium">{label}</span>
			</div>
			<span className="text-sm font-bold">{value}</span>
		</div>
	);
}
