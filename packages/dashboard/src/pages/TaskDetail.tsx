import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Clock, DollarSign } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { fetchTaskDetail } from '../api/client';
import { Card } from '../components/Card';

export function TaskDetail() {
	const { taskId } = useParams<{ taskId: string }>();

	const { data: task } = useQuery({
		queryKey: ['task', taskId],
		queryFn: () => {
			if (!taskId) throw new Error('Task ID is required');
			return fetchTaskDetail(taskId);
		},
		enabled: !!taskId,
	});

	if (!task) {
		return (
			<div className="flex items-center justify-center h-96">
				<p className="text-muted-foreground">Loading task details...</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<Link
					to="/tasks"
					className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to tasks
				</Link>
				<h1 className="text-3xl font-bold tracking-tight">Task Details</h1>
				<p className="text-muted-foreground">ID: {task.id}</p>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<div className="p-6">
						<div className="flex items-center gap-2 text-muted-foreground mb-2">
							<Clock className="h-4 w-4" />
							<span className="text-sm font-medium">Duration</span>
						</div>
						<p className="text-2xl font-bold">
							{task.duration ? `${task.duration}s` : 'In progress'}
						</p>
					</div>
				</Card>

				<Card>
					<div className="p-6">
						<div className="flex items-center gap-2 text-muted-foreground mb-2">
							<DollarSign className="h-4 w-4" />
							<span className="text-sm font-medium">Cost</span>
						</div>
						<p className="text-2xl font-bold">${(task.cost ?? 0).toFixed(4)}</p>
					</div>
				</Card>

				<Card>
					<div className="p-6">
						<p className="text-sm font-medium text-muted-foreground mb-2">Provider</p>
						<p className="text-2xl font-bold">{task.provider}</p>
					</div>
				</Card>
			</div>

			<Card>
				<div className="p-6 space-y-4">
					<h2 className="text-lg font-semibold">Task Information</h2>
					<dl className="grid grid-cols-2 gap-4">
						<div>
							<dt className="text-sm font-medium text-muted-foreground">Status</dt>
							<dd className="mt-1 text-sm">{task.status}</dd>
						</div>
						<div>
							<dt className="text-sm font-medium text-muted-foreground">Access Mode</dt>
							<dd className="mt-1 text-sm">{task.accessMode ?? 'N/A'}</dd>
						</div>
						<div>
							<dt className="text-sm font-medium text-muted-foreground">Started At</dt>
							<dd className="mt-1 text-sm">{format(new Date(task.startedAt), 'PPpp')}</dd>
						</div>
						{task.completedAt && (
							<div>
								<dt className="text-sm font-medium text-muted-foreground">Completed At</dt>
								<dd className="mt-1 text-sm">{format(new Date(task.completedAt), 'PPpp')}</dd>
							</div>
						)}
					</dl>
				</div>
			</Card>

			<Card>
				<div className="p-6">
					<h2 className="text-lg font-semibold mb-3">Prompt</h2>
					<div className="bg-gray-50 rounded-lg p-4">
						<p className="text-sm text-gray-700 whitespace-pre-wrap">{task.prompt}</p>
					</div>
				</div>
			</Card>

			{task.events && task.events.length > 0 && (
				<Card>
					<div className="p-6">
						<h2 className="text-lg font-semibold mb-4">Event Log</h2>
						<div className="space-y-2">
							{task.events.map((event) => (
								<div
									key={`${event.type}-${event.timestamp}`}
									className="border-l-2 border-gray-200 pl-4 py-2"
								>
									<p className="text-sm font-medium">{event.type}</p>
									<p className="text-xs text-muted-foreground">
										{format(new Date(event.timestamp), 'HH:mm:ss')}
									</p>
									{event.data !== undefined && event.data !== null && (
										<pre className="text-xs text-gray-600 mt-1 overflow-x-auto">
											{JSON.stringify(event.data, null, 2)}
										</pre>
									)}
								</div>
							))}
						</div>
					</div>
				</Card>
			)}
		</div>
	);
}
