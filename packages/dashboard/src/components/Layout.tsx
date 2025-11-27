import { Activity, Boxes, LayoutDashboard, ListTodo, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

export function Layout() {
	return (
		<div className="min-h-screen bg-gray-50">
			<aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-200 bg-white">
				<div className="flex h-full flex-col">
					<div className="flex h-16 items-center border-b border-gray-200 px-6">
						<Activity className="mr-2 h-6 w-6 text-primary" />
						<h1 className="text-xl font-bold">ADO Dashboard</h1>
					</div>
					<nav className="flex-1 space-y-1 px-3 py-4">
						<NavItem to="/dashboard" icon={LayoutDashboard}>
							Dashboard
						</NavItem>
						<NavItem to="/tasks" icon={ListTodo}>
							Tasks
						</NavItem>
						<NavItem to="/providers" icon={Boxes}>
							Providers
						</NavItem>
						<NavItem to="/settings" icon={Settings}>
							Settings
						</NavItem>
					</nav>
				</div>
			</aside>

			<main className="ml-64 p-8">
				<Outlet />
			</main>
		</div>
	);
}

interface NavItemProps {
	to: string;
	icon: React.ComponentType<{ className?: string }>;
	children: React.ReactNode;
}

function NavItem({ to, icon: Icon, children }: NavItemProps) {
	return (
		<NavLink
			to={to}
			className={({ isActive }) =>
				`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
					isActive ? 'bg-primary text-primary-foreground' : 'text-gray-700 hover:bg-gray-100'
				}`
			}
		>
			<Icon className="h-5 w-5" />
			{children}
		</NavLink>
	);
}
