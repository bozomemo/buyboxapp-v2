import { describe, expect, it } from 'vitest';
import {
  GLOBAL_KILL_SWITCH_SETTING_KEY,
  isKillSwitchEngaged,
  isMarketplaceKillSwitchEngaged,
  marketplaceKillSwitchSettingKey,
  SYSTEM_PAUSE_SETTING_KEY,
} from './kill-switch.js';

describe('isKillSwitchEngaged — fail-closed, shared by the system pause and the global price switch', () => {
  it.each([
    ['undefined (no settings row at all — a fresh install)', undefined, true],
    ['"true" (explicitly engaged)', 'true', true],
    ['"false" (explicitly disengaged — the only value that allows resuming)', 'false', false],
    ['"" (an empty stored value)', '', true],
    ['"False" (wrong case — never inferred as the safe value)', 'False', true],
    ['"0" (a plausible but wrong falsy spelling)', '0', true],
    ['garbage', 'not-a-boolean', true],
  ])('%s → engaged = %s', (_label, value, expected) => {
    expect(isKillSwitchEngaged(value)).toBe(expected);
  });
});

describe('isMarketplaceKillSwitchEngaged — fail-open, the narrower opt-in control', () => {
  it.each([
    ['undefined (no settings row — not individually stopped)', undefined, false],
    ['"true" (explicitly engaged)', 'true', true],
    ['"false"', 'false', false],
    ['garbage never reads as engaged', 'yes', false],
  ])('%s → engaged = %s', (_label, value, expected) => {
    expect(isMarketplaceKillSwitchEngaged(value)).toBe(expected);
  });
});

describe('setting keys — three genuinely separate states, three separate keys', () => {
  it('system pause, the global price switch and the per-marketplace switch are distinct keys', () => {
    expect(SYSTEM_PAUSE_SETTING_KEY).toBe('global.systemPause');
    expect(GLOBAL_KILL_SWITCH_SETTING_KEY).toBe('global.killSwitch');
    expect(SYSTEM_PAUSE_SETTING_KEY).not.toBe(GLOBAL_KILL_SWITCH_SETTING_KEY);
  });

  it('the per-marketplace key is scoped by marketplace code', () => {
    expect(marketplaceKillSwitchSettingKey('trendyol')).toBe('marketplace.trendyol.killSwitch');
    expect(marketplaceKillSwitchSettingKey('hepsiburada')).toBe('marketplace.hepsiburada.killSwitch');
  });
});
