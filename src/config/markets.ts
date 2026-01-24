import { Market } from '../types';
import { DEFAULT_MARKETS } from './defaults';
import { PersistenceService } from '../services/persistenceService';

/**
 * Get configured markets (Defaults + User Custom)
 */
export function getMarkets(): Market[] {
  const userMarkets = PersistenceService.getUserMarkets();

  // Use a map to allow user markets to override defaults by name
  const marketMap = new Map<string, Market>();

  // 1. Add defaults
  DEFAULT_MARKETS.forEach(m => marketMap.set(m.name, m));

  // 2. Add/Override with user markets
  userMarkets.forEach(m => marketMap.set(m.name, m));

  return Array.from(marketMap.values());
}
