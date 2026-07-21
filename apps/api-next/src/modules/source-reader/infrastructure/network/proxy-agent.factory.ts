import { ProxyAgent } from 'proxy-agent';
import type { ResolvedNetworkRoute } from '../../application/ports/network-route.port.js';

export class ProxyAgentFactory {
  private readonly agents = new Map<string, ProxyAgent>();

  constructor(private readonly maxEntries = 20) {}

  get(route: Exclude<ResolvedNetworkRoute, { kind: 'direct' }>): ProxyAgent {
    const existing = this.agents.get(route.identity);
    if (existing) return existing;
    const endpoint = new URL(route.endpoint);
    if (route.username) endpoint.username = route.username;
    if (route.password) endpoint.password = route.password;
    const agent = new ProxyAgent({ getProxyForUrl: () => endpoint.toString() });
    this.agents.set(route.identity, agent);
    if (this.agents.size > this.maxEntries) {
      const oldest = this.agents.keys().next().value as string | undefined;
      if (oldest) {
        this.agents.get(oldest)?.destroy();
        this.agents.delete(oldest);
      }
    }
    return agent;
  }

  destroy(): void {
    for (const agent of this.agents.values()) agent.destroy();
    this.agents.clear();
  }
}
