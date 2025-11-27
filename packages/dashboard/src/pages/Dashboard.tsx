import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, Clock, DollarSign, TrendingUp } from 'lucide-react';
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { fetchDashboardStats, fetchUsageHistory } from '../api/client';
import { Card } from '../components/Card';

export function Dashboard() {
	const { data: stats } = useQuery({
		queryKey: ['dashboard-stats'],
		queryFn: fetchDashboardStats,
	});

	const { data: usageHistory } = useQuery({
		queryKey: ['usage-history'],
		queryFn: fetchUsageHistory,
	});

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
				<p className="text-muted-foreground">Overview of your ADO orchestrator activity</p>
			</div>

			{/* Stats Grid */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<StatCard
					title="Active Tasks"
					value={stats?.activeTasks ?? 0}
					icon={Activity}
					trend="+12%"
					trendUp={true}
				/>
				<StatCard
					title="Completed Today"
					value={stats?.completedToday ?? 0}
					icon={TrendingUp}
					trend="+8%"
					trendUp={true}
				/>
				<StatCard
					title="API Cost (24h)"
					value={`$${(stats?.apiCost24h ?? 0).toFixed(2)}`}
					icon={DollarSign}
					trend="-5%"
					trendUp={false}
				/>
				<StatCard
					title="Avg Duration"
					value={`${stats?.avgDuration ?? 0}s`}
					icon={Clock}
					trend="-2s"
					trendUp={false}
				/>
			</div>

			{/* Charts */}
			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<div className="p-6">
						<h3 className="text-lg font-semibold mb-4">Task Volume (7 Days)</h3>
						<ResponsiveContainer width="100%" height={300}>
							<AreaChart data={usageHistory?.taskVolume ?? []}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="date" />
								<YAxis />
								<Tooltip />
								<Area
									type="monotone"
									dataKey="count"
									stroke="#3b82f6"
									fill="#3b82f6"
									fillOpacity={0.2}
								/>
							</AreaChart>
						</ResponsiveContainer>
					</div>
				</Card>

				<Card>
					<div className="p-6">
						<h3 className="text-lg font-semibold mb-4">Provider Usage Distribution</h3>
						<ResponsiveContainer width="100%" height={300}>
							<BarChart data={usageHistory?.providerUsage ?? []}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="provider" />
								<YAxis />
								<Tooltip />
								<Bar dataKey="count" fill="#3b82f6" />
							</BarChart>
						</ResponsiveContainer>
					</div>
				</Card>
			</div>

			{/* Cost Tracking */}
			<Card>
				<div className="p-6">
					<h3 className="text-lg font-semibold mb-4">API Cost Trend (7 Days)</h3>
					<ResponsiveContainer width="100%" height={300}>
						<LineChart data={usageHistory?.costTrend ?? []}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="date" />
							<YAxis />
							<Tooltip />
							<Legend />
							<Line type="monotone" dataKey="subscription" stroke="#10b981" name="Subscription" />
							<Line type="monotone" dataKey="api" stroke="#f59e0b" name="API" />
						</LineChart>
					</ResponsiveContainer>
				</div>
			</Card>

			{/* Recent Alerts */}
			{stats?.recentAlerts && stats.recentAlerts.length > 0 && (
				<Card>
					<div className="p-6">
						<h3 className="text-lg font-semibold mb-4">Recent Alerts</h3>
						<div className="space-y-2">
							{stats.recentAlerts.map((alert) => (
								<div
									key={`${alert.message}-${alert.time}`}
									className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3"
								>
									<AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
									<div>
										<p className="font-medium text-sm">{alert.message}</p>
										<p className="text-xs text-muted-foreground">{alert.time}</p>
									</div>
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
						<p className={`text-xs ${trendUp ? 'text-green-600' : 'text-red-600'}`}>
							{trend} from yesterday
						</p>
					)}
				</div>
			</div>
		</Card>
	);
}
