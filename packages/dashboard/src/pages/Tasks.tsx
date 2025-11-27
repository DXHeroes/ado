import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2, Clock, PauseCircle, PlayCircle, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchTasks } from '../api/client';
import { Card } from '../components/Card';

const statusIcons = {
	running: PlayCircle,
	paused: PauseCircle,
	completed: CheckCircle2,
	failed: XCircle,
	pending: Clock,
};

const statusColors = {
	running: 'text-blue-600 bg-blue-50',
	paused: 'text-yellow-600 bg-yellow-50',
	completed: 'text-green-600 bg-green-50',
	failed: 'text-red-600 bg-red-50',
	pending: 'text-gray-600 bg-gray-50',
};

export function Tasks() {
	const { data: tasks } = useQuery({
		queryKey: ['tasks'],
		queryFn: fetchTasks,
	});

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
					<p className="text-muted-foreground">Monitor and manage your orchestrated tasks</p>
				</div>
			</div>

			<Card>
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="border-b border-gray-200 bg-gray-50">
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Task ID
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Prompt
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Provider
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Status
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Started
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Duration
								</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
							{tasks?.map((task) => {
								const StatusIcon = statusIcons[task.status];
								const statusColor = statusColors[task.status];

								return (
									<tr key={task.id} className="hover:bg-gray-50 transition-colors">
										<td className="px-6 py-4 whitespace-nowrap">
											<Link
												to={`/tasks/${task.id}`}
												className="text-sm font-medium text-primary hover:underline"
											>
												{task.id.slice(0, 8)}
											</Link>
										</td>
										<td className="px-6 py-4">
											<p className="text-sm text-gray-900 truncate max-w-md">{task.prompt}</p>
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<span className="text-sm text-gray-500">{task.provider}</span>
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<span
												className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}
											>
												<StatusIcon className="h-3.5 w-3.5" />
												{task.status}
											</span>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
											{format(new Date(task.startedAt), 'MMM d, HH:mm')}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
											{task.duration ? `${task.duration}s` : '-'}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>

					{(!tasks || tasks.length === 0) && (
						<div className="text-center py-12">
							<p className="text-sm text-muted-foreground">No tasks found</p>
						</div>
					)}
				</div>
			</Card>
		</div>
	);
}
