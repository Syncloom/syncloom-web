// The browser must see the app as http://localhost:8088 (a secure context, and the WebAuthn RP id the server
// was configured with). Inside the test network the stack is reachable as http://caddy, so forward the port.
import net from 'node:net';

export default async function setup() {
	const target = process.env.STACK_HOST ?? 'caddy';
	const server = net.createServer((c) => {
		const up = net.connect(80, target);
		c.pipe(up);
		up.pipe(c);
		c.on('error', () => up.destroy());
		up.on('error', () => c.destroy());
	});
	await new Promise<void>((r) => server.listen(8088, '127.0.0.1', r));
	return () => server.close();
}
