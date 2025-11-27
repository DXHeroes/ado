import { Card } from '../components/Card';

export function Settings() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Settings</h1>
				<p className="text-muted-foreground">Configure your ADO orchestrator preferences</p>
			</div>

			<Card>
				<div className="p-6">
					<h2 className="text-lg font-semibold mb-4">Routing Configuration</h2>
					<div className="space-y-4">
						<div>
							<label htmlFor="routing-strategy" className="block text-sm font-medium mb-2">
								Routing Strategy
							</label>
							<select
								id="routing-strategy"
								className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
							>
								<option value="subscription-first">Subscription First</option>
								<option value="round-robin">Round Robin</option>
								<option value="cost-optimized">Cost Optimized</option>
							</select>
						</div>

						<div>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									className="rounded border-gray-300 text-primary focus:ring-primary"
									defaultChecked
								/>
								<span className="text-sm font-medium">Enable API Fallback</span>
							</label>
						</div>

						<div>
							<label htmlFor="max-api-cost" className="block text-sm font-medium mb-2">
								Max API Cost Per Task ($)
							</label>
							<input
								id="max-api-cost"
								type="number"
								className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
								defaultValue="10.00"
								step="0.01"
							/>
						</div>
					</div>
				</div>
			</Card>

			<Card>
				<div className="p-6">
					<h2 className="text-lg font-semibold mb-4">Human-in-the-Loop (HITL)</h2>
					<div className="space-y-4">
						<div>
							<label htmlFor="default-policy" className="block text-sm font-medium mb-2">
								Default Policy
							</label>
							<select
								id="default-policy"
								className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
							>
								<option value="autonomous">Autonomous</option>
								<option value="review-edits">Review Edits</option>
								<option value="approve-steps">Approve Steps</option>
								<option value="manual">Manual</option>
							</select>
						</div>

						<div>
							<label htmlFor="cost-threshold" className="block text-sm font-medium mb-2">
								Escalate on Cost Threshold ($)
							</label>
							<input
								id="cost-threshold"
								type="number"
								className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
								defaultValue="5.00"
								step="0.01"
							/>
						</div>
					</div>
				</div>
			</Card>

			<Card>
				<div className="p-6">
					<h2 className="text-lg font-semibold mb-4">Notifications</h2>
					<div className="space-y-4">
						<div>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									className="rounded border-gray-300 text-primary focus:ring-primary"
									defaultChecked
								/>
								<span className="text-sm font-medium">Slack Notifications</span>
							</label>
							<input
								type="text"
								className="mt-2 w-full max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
								placeholder="Slack webhook URL"
							/>
						</div>

						<div>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									className="rounded border-gray-300 text-primary focus:ring-primary"
								/>
								<span className="text-sm font-medium">Email Notifications</span>
							</label>
							<input
								type="email"
								className="mt-2 w-full max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
								placeholder="your@email.com"
							/>
						</div>
					</div>
				</div>
			</Card>

			<div className="flex justify-end">
				<button
					type="button"
					className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
				>
					Save Changes
				</button>
			</div>
		</div>
	);
}
