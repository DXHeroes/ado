import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ParallelExecution } from './pages/ParallelExecution';
import { Providers } from './pages/Providers';
import { Settings } from './pages/Settings';
import { TaskDetail } from './pages/TaskDetail';
import { Tasks } from './pages/Tasks';

function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<Layout />}>
					<Route index element={<Navigate to="/dashboard" replace />} />
					<Route path="dashboard" element={<Dashboard />} />
					<Route path="parallel" element={<ParallelExecution />} />
					<Route path="tasks" element={<Tasks />} />
					<Route path="tasks/:taskId" element={<TaskDetail />} />
					<Route path="providers" element={<Providers />} />
					<Route path="settings" element={<Settings />} />
				</Route>
			</Routes>
		</BrowserRouter>
	);
}

export default App;
