import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CheckCircle2, XCircle } from 'lucide-react';
import { fetchProviders, toggleProvider } from '../api/client';
import { Card } from '../components/Card';

export function Providers() {
	const queryClient = useQueryClient();
	const { data: providers } = useQuery({
		queryKey: ['providers'],
		queryFn: fetchProviders,
	});

	const toggleMutation = useMutation({
		mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleProvider(id, enabled),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['providers'] });
		},
	});

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Providers</h1>
				<p className="text-muted-foreground">Manage AI coding agents and their configurations</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{providers?.map((provider) => (
					<Card key={provider.id}>
						<div className="p-6">
							<div className="flex items-start justify-between mb-4">
								<div>
									<h3 className="text-lg font-semibold">{provider.name}</h3>
									<p className="text-sm text-muted-foreground">{provider.id}</p>
								</div>
								<button
									type="button"
									onClick={() =>
										toggleMutation.mutate({
											id: provider.id,
											enabled: !provider.enabled,
										})
									}
									className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
										provider.enabled
											? 'bg-green-100 text-green-700 hover:bg-green-200'
											: 'bg-gray-100 text-gray-700 hover:bg-gray-200'
									}`}
								>
									{provider.enabled ? 'Enabled' : 'Disabled'}
								</button>
							</div>

							<div className="space-y-3">
								<div>
									<p className="text-xs font-medium text-muted-foreground mb-1">Access Modes</p>
									<div className="space-y-1">
										{provider.accessModes.map((mode) => (
											<div key={mode.mode} className="flex items-center justify-between text-sm">
												<span className="capitalize">{mode.mode}</span>
												{mode.enabled ? (
													<CheckCircle2 className="h-4 w-4 text-green-600" />
												) : (
													<XCircle className="h-4 w-4 text-gray-400" />
												)}
											</div>
										))}
									</div>
								</div>

								<div>
									<p className="text-xs font-medium text-muted-foreground mb-1">Rate Limits</p>
									{provider.rateLimits ? (
										<div className="space-y-1 text-sm">
											{provider.rateLimits.requestsPerDay && (
												<div className="flex justify-between">
													<span className="text-muted-foreground">Requests/day</span>
													<span>{provider.rateLimits.requestsPerDay}</span>
												</div>
											)}
											{provider.rateLimits.requestsPerHour && (
												<div className="flex justify-between">
													<span className="text-muted-foreground">Requests/hour</span>
													<span>{provider.rateLimits.requestsPerHour}</span>
												</div>
											)}
										</div>
									) : (
										<p className="text-sm text-muted-foreground">No limits</p>
									)}
								</div>

								<div>
									<p className="text-xs font-medium text-muted-foreground mb-1">Capabilities</p>
									<div className="flex flex-wrap gap-1">
										{Object.entries(provider.capabilities)
											.filter(([_, value]) => value === true)
											.map(([key]) => (
												<span
													key={key}
													className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
												>
													{key.replace(/([A-Z])/g, ' $1').trim()}
												</span>
											))}
									</div>
								</div>

								{provider.usage && (
									<div className="pt-3 border-t border-gray-200">
										<div className="flex items-center gap-2 text-sm">
											<Activity className="h-4 w-4 text-muted-foreground" />
											<span className="text-muted-foreground">
												{provider.usage.requestsToday ?? 0} requests today
											</span>
										</div>
									</div>
								)}
							</div>
						</div>
					</Card>
				))}
			</div>

			{(!providers || providers.length === 0) && (
				<div className="text-center py-12">
					<p className="text-sm text-muted-foreground">No providers configured</p>
				</div>
			)}
		</div>
	);
}
