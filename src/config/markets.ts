import * as vscode from 'vscode';
import { Market } from '../types';

/**
 * Built-in default market configurations
 */
export const DEFAULT_MARKETS: Market[] = [
  {
    name: 'Anthropic Official',
    git: 'anthropics/skills',
  },
  {
    name: 'Superpowers',
    git: 'obra/superpowers',
  },
  {
    name: 'Vercel Labs',
    git: 'vercel-labs/agent-browser',
  },
];

/**
 * Get merged markets from default + user configuration
 */
export function getMarkets(): Market[] {
  const config = vscode.workspace.getConfiguration('skillManager');
  const userMarkets = config.get<Market[]>('markets');

  // If user has configured markets, use only those (complete override)
  if (userMarkets && userMarkets.length > 0) {
    return userMarkets;
  }

  return DEFAULT_MARKETS;
}
