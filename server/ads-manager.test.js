import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createAdsManager } from './ads-manager.js';

test('createAdsManager initializes tables and pre-seeds realistic campaigns and rules', () => {
  const db = new DatabaseSync(':memory:');
  const clock = () => '2026-11-08T20:00:00.000Z';
  const ads = createAdsManager({ db, clock });

  const campaigns = ads.listCampaigns();
  assert(campaigns.length >= 5, 'Should have pre-seeded default campaigns');
  const rules = ads.listRules();
  assert(rules.length >= 4, 'Should have pre-seeded rules');

  const summary = ads.getSummary();
  assert(summary.totalSpend > 0);
  assert(summary.totalOrders > 0);
  assert(summary.blendedRoas > 0);

  db.close();
});

test('createAdsManager manages and masks credentials safely', () => {
  const db = new DatabaseSync(':memory:');
  const ads = createAdsManager({ db });

  // Initially simulation
  const initial = ads.getCredentials();
  assert.equal(initial.meta.configured, false);
  assert.equal(initial.meta.mode, 'simulation');

  // Save Meta credentials
  ads.saveCredentials('meta', {
    accountId: 'act_1092837465',
    accessToken: 'EAAG1234567890abcdefghijklmnopqrstuvwxyz',
    pixelId: 'pix_987654321',
    mode: 'real'
  });

  const updated = ads.getCredentials();
  assert.equal(updated.meta.configured, true);
  assert.equal(updated.meta.accountId, 'act_1092837465');
  assert.equal(updated.meta.pixelId, 'pix_987654321');
  assert.equal(updated.meta.mode, 'real');
  assert(updated.meta.tokenPreview.includes('••••••••'));
  assert(!updated.meta.tokenPreview.includes('abcdefgh')); // token is masked

  db.close();
});

test('createAdsManager toggles campaigns and updates daily budget', () => {
  const db = new DatabaseSync(':memory:');
  const ads = createAdsManager({ db });

  const campaigns = ads.listCampaigns();
  const first = campaigns[0];

  // Toggle to PAUSED
  const paused = ads.toggleCampaign(first.id, 'PAUSED');
  assert.equal(paused.status, 'PAUSED');

  // Scale budget +20%
  const oldBudget = first.daily_budget;
  const scaled = ads.updateBudget(first.id, { value: 20, type: 'percentage' });
  assert.equal(scaled.daily_budget, Math.round(oldBudget * 1.20));

  db.close();
});

test('evaluateAutomations executes scale rule for 30+ orders and kill switch for 0 orders', () => {
  const db = new DatabaseSync(':memory:');
  const clock = () => '2026-11-08T20:30:00.000Z';
  const ads = createAdsManager({ db, clock });

  // Find candidate for 30+ orders (e.g. meta-cmp-01 with 34 orders)
  const target = ads.listCampaigns().find(c => c.id === 'meta-cmp-01');
  assert(target && target.orders >= 30);
  const initialBudget = target.daily_budget;

  // Find candidate for stop-loss (meta-cmp-03 with 0 orders and > 15000 spend)
  const stopTarget = ads.listCampaigns().find(c => c.id === 'meta-cmp-03');
  assert(stopTarget && stopTarget.orders === 0 && stopTarget.spend >= 15000);
  assert.equal(stopTarget.status, 'ACTIVE');

  // Run evaluation
  const result = ads.evaluateAutomations();
  assert(result.actionsExecuted >= 2, 'Should have executed scale and stop-loss actions');

  // Check that meta-cmp-01 budget was scaled by +20%
  const updatedTarget = ads.listCampaigns().find(c => c.id === 'meta-cmp-01');
  assert.equal(updatedTarget.daily_budget, Math.round(initialBudget * 1.20));

  // Check that meta-cmp-03 was paused by stop-loss
  const updatedStop = ads.listCampaigns().find(c => c.id === 'meta-cmp-03');
  assert.equal(updatedStop.status, 'PAUSED');

  // Check logs
  const logs = ads.listLogs();
  assert(logs.length >= 2);
  assert(logs.some(l => l.action === 'scale_budget_percent'));
  assert(logs.some(l => l.action === 'pause_campaign'));

  db.close();
});

test('createAdsManager allows creating, toggling and deleting custom rules', () => {
  const db = new DatabaseSync(':memory:');
  const ads = createAdsManager({ db });

  const newRule = ads.createRule({
    name: 'Escalado VIP (+30% si CPA < $5000)',
    platform: 'meta',
    metric: 'cpa',
    operator: '<=',
    threshold: 5000,
    action: 'scale_budget_percent',
    actionValue: 30,
    frequency: 'every_1h'
  });

  assert(newRule.id.startsWith('rule-'));
  assert.equal(newRule.action_value, 30);
  assert.equal(newRule.enabled, 1);

  // Toggle
  const toggled = ads.toggleRule(newRule.id, false);
  assert.equal(toggled.enabled, 0);

  // Delete
  const del = ads.deleteRule(newRule.id);
  assert.equal(del.deleted, true);
  assert(!ads.listRules().some(r => r.id === newRule.id));

  db.close();
});
