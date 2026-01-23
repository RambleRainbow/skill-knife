import * as vscode from 'vscode';
import { Market } from '../types';

/**
 * Get configured markets
 */
export function getMarkets(): Market[] {
  const config = vscode.workspace.getConfiguration('skillManager');
  return config.get<Market[]>('markets') || [];
}
