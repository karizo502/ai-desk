import React from 'react';
import type { DashboardSnapshot } from './dashboard-server.js';

interface ConsoleViewProps {
  snapshot: DashboardSnapshot;
  onRefresh?: () => void;
}

export function ConsoleView({ snapshot, onRefresh }: ConsoleViewProps) {
  const formatUptime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatBudget = (used: number, limit: number) => {
    const percentage = (used / limit) * 100;
    return {
      percentage,
      status: percentage > 90 ? 'danger' : percentage > 70 ? 'warning' : 'normal'
    };
  };

  const budgetStatus = formatBudget(snapshot.budget.dailyUsed, snapshot.budget.dailyLimit);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-white">AI_DESK Console</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">
                Uptime: {formatUptime(snapshot.uptime)}
              </span>
              <button
                onClick={onRefresh}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-400">{snapshot.connections}</div>
              <div className="text-sm text-gray-400">Active Connections</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-400">{snapshot.agents.length}</div>
              <div className="text-sm text-gray-400">Agents</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-400">{snapshot.activeSessions}</div>
              <div className="text-sm text-gray-400">Active Sessions</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-400">{snapshot.skills.length}</div>
              <div className="text-sm text-gray-400">Skills</div>
            </div>
          </div>
        </div>

        {/* Budget Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-white">Budget Status</h2>
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Daily Usage</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Tokens Used</span>
                    <span className="font-mono">{snapshot.budget.dailyUsed.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Daily Limit</span>
                    <span className="font-mono">{snapshot.budget.dailyLimit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cost</span>
                    <span className="font-mono">${snapshot.budget.monthlyCostUsed.toFixed(4)}</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Monthly Usage</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Tokens Used</span>
                    <span className="font-mono">{snapshot.budget.monthlyUsed.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monthly Limit</span>
                    <span className="font-mono">{snapshot.budget.monthlyLimit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cost Limit</span>
                    <span className="font-mono">${snapshot.budget.monthlyCostLimit.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <div className="flex justify-between items-center mb-2">
                <span>Daily Usage Progress</span>
                <span className="text-sm font-mono">
                  {budgetStatus.percentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${
                    budgetStatus.status === 'danger' ? 'bg-red-500' :
                    budgetStatus.status === 'warning' ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(budgetStatus.percentage, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Agents */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-white">Agents</h2>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Model</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Sessions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {snapshot.agents.map((agent, index) => (
                  <tr key={agent.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{agent.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{agent.model}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        agent.status === 'running' ? 'bg-green-900 text-green-300' : 'bg-gray-600 text-gray-300'
                      }`}>
                        {agent.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{agent.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* MCP Servers */}
        {snapshot.mcpServers.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-white">MCP Servers</h2>
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Server</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Tools</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {snapshot.mcpServers.map((server, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{server.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          server.ready ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                        }`}>
                          {server.ready ? 'Ready' : 'Failed'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{server.tools}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Messaging Adapters */}
        {snapshot.messaging.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-white">Messaging Adapters</h2>
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Platform</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {snapshot.messaging.map((adapter, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{adapter.platform}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          adapter.running ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                        }`}>
                          {adapter.running ? 'Running' : 'Stopped'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Teams */}
        {snapshot.teams.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-white">Teams</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {snapshot.teams.map((team, index) => (
                <div key={team.id} className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-medium mb-2 text-white">{team.name}</h3>
                  <div className="text-sm text-gray-400 space-y-1">
                    <div>Lead: {team.leadAgentId}</div>
                    <div>Members: {team.members.length}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {snapshot.skills.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 text-white">Skills</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {snapshot.skills.map((skill, index) => (
                <div key={index} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-medium text-white">{skill.name}</h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      skill.enabled ? 'bg-green-900 text-green-300' : 'bg-gray-600 text-gray-300'
                    }`}>
                      {skill.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400">v{skill.version}</div>
                  <p className="text-sm text-gray-300 mt-2">{skill.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Providers */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-white">Model Providers</h2>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Provider</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Models</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {snapshot.providers.map((provider, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{provider.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        provider.available ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                      }`}>
                        {provider.available ? 'Available' : 'Unavailable'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {provider.models.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}