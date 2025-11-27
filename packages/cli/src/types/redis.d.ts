/**
 * Optional Redis type declarations
 * Redis is an optional dependency for rate limit tracking
 */
declare module 'redis' {
	export function createClient(options?: { url?: string }): {
		connect(): Promise<void>;
		disconnect(): Promise<void>;
		[key: string]: unknown;
	};
}
