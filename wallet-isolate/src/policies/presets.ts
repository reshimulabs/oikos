/**
 * Policy Presets — ready-to-use policy configurations.
 */

import type { PolicyConfig } from './types.js';

/** Conservative: low limits, strict confidence, cooldown. For production. */
export const CONSERVATIVE: PolicyConfig = {
  policies: [{
    id: 'conservative',
    name: 'Conservative Policy',
    rules: [
      { type: 'max_per_tx', amount: '2000000', symbol: 'USDT' },        // 2 USDT
      { type: 'max_per_session', amount: '10000000', symbol: 'USDT' },   // 10 USDT
      { type: 'max_per_day', amount: '25000000', symbol: 'USDT' },       // 25 USDT
      { type: 'max_per_recipient_per_day', amount: '5000000', symbol: 'USDT' }, // 5 USDT
      { type: 'cooldown_seconds', seconds: 60 },
      { type: 'require_confidence', min: 0.8 },
      { type: 'time_window', start_hour: 8, end_hour: 22, timezone: 'UTC' }
    ]
  }]
};

/** Moderate: balanced limits for everyday use. */
export const MODERATE: PolicyConfig = {
  policies: [{
    id: 'moderate',
    name: 'Moderate Policy',
    rules: [
      { type: 'max_per_tx', amount: '5000000', symbol: 'USDT' },        // 5 USDT
      { type: 'max_per_session', amount: '25000000', symbol: 'USDT' },   // 25 USDT
      { type: 'max_per_day', amount: '50000000', symbol: 'USDT' },       // 50 USDT
      { type: 'max_per_recipient_per_day', amount: '15000000', symbol: 'USDT' }, // 15 USDT
      { type: 'cooldown_seconds', seconds: 30 },
      { type: 'require_confidence', min: 0.65 }
    ]
  }]
};

/**
 * Demo: designed to show policy enforcement within a 5-minute demo.
 * Low limits so the agent hits them quickly.
 */
export const DEMO: PolicyConfig = {
  policies: [{
    id: 'demo',
    name: 'Demo Policy (5-min showcase)',
    rules: [
      { type: 'max_per_tx', amount: '5000000', symbol: 'USDT' },        // 5 USDT
      { type: 'max_per_session', amount: '15000000', symbol: 'USDT' },   // 15 USDT (hit by min 5)
      { type: 'max_per_day', amount: '50000000', symbol: 'USDT' },       // 50 USDT
      { type: 'max_per_recipient_per_day', amount: '10000000', symbol: 'USDT' }, // 10 USDT
      { type: 'cooldown_seconds', seconds: 15 },
      { type: 'require_confidence', min: 0.6 }
    ]
  }]
};
