import * as vscode from 'vscode';
import { Market } from '../types';

/**
 * Get configured markets
 */
export function getMarkets(): Market[] {
  const config = vscode.workspace.getConfiguration('skillKnife');
  return config.get<Market[]>('markets') || [];
}
