/*
 * The ONLY place prices are decided. The game shows prices too, but the amount a
 * player is charged always comes from here, so nobody can lower a price from
 * their browser. Keep it in sync with the SHOP list in the game (CAD, in cents).
 */
import { ClientError } from './http.js';

export const CURRENCY = 'cad';

export const CATALOG = {
  // coin packs
  'coins-2000':                { name: '2,000 Coins',                      cents: 100 },
  'coins-10000':               { name: '10,000 Coins',                     cents: 400 },
  // lives / time
  'extra-life-1':              { name: 'Extra Life (1)',                   cents: 149 },
  'extra-life-3':              { name: 'Extra Life (3)',                   cents: 399 },
  'extra-life-5':              { name: 'Extra Life (5)',                   cents: 599 },
  'extra-time-30sec':          { name: 'Extra Time (30 sec)',              cents: 99 },
  'extra-time-1min':           { name: 'Extra Time (1 min)',               cents: 150 },
  'slow-timer':                { name: 'Slow Timer',                       cents: 129 },
  // balls
  'slow-ball':                 { name: 'Slow Ball',                        cents: 100 },
  'fire-ball':                 { name: 'Fire Ball',                        cents: 249 },
  'giant-ball':                { name: 'Giant Ball',                       cents: 199 },
  'electric-fire-ball':        { name: 'Electric Fire Ball',               cents: 349 },
  'multiple-balls-3':          { name: 'Multiple Balls (3)',               cents: 249 },
  'multiple-balls-2':          { name: 'Multiple Balls (2)',               cents: 149 },
  'fast-ball':                 { name: 'Fast Ball',                        cents: 129 },
  // boards
  'magnetic-board':            { name: 'Magnetic Board',                   cents: 149 },
  'bullets-board':             { name: 'Bullets Board',                    cents: 229 },
  'extended-board':            { name: 'Extended Board',                   cents: 299 },
  'shield':                    { name: 'Shield',                           cents: 179 },
  // specials
  'remove-ads-1day':           { name: 'Remove All Ads (1 day)',           cents: 100 },
  'remove-ads-3day':           { name: 'Remove All Ads (3 days)',          cents: 200 },
  'remove-ads-5day':           { name: 'Remove All Ads (5 days)',          cents: 299 },
  'skip-pregame-1day':         { name: 'Skip Pregame (1 day)',             cents: 100 },
  'skip-pregame-3day':         { name: 'Skip Pregame (3 days)',            cents: 200 },
  'skip-pregame-5day':         { name: 'Skip Pregame (5 days)',            cents: 300 },
  'unlock-pause-1day':         { name: 'Unlock Pause (1 day)',             cents: 149 },
  'easier-level-50pct':        { name: '50% Easier Level',                 cents: 1000 },
  'skip-to-level-121':         { name: 'Skip to the Last 30 Levels',       cents: 1000 },
  'remove-teleporters-1day':   { name: 'Remove Teleporters (1 level)',     cents: 200 },
  'remove-teleporters-3level': { name: 'Remove Teleporters (3 levels)',    cents: 400 },
  'remove-shooting-3level':    { name: 'Remove Shooting Tiles (3 levels)', cents: 100 },
  'remove-shooting-5level':    { name: 'Remove Shooting Tiles (5 levels)', cents: 300 },
  'auto-save-1day':            { name: 'Auto Save Levels 121-150 (1 day)', cents: 50 },
  'auto-save-3day':            { name: 'Auto Save Levels 121-150 (3 days)', cents: 100 },
  'auto-save-5day':            { name: 'Auto Save Levels 121-150 (5 days)', cents: 150 },
  // game-over offers
  'continue-playing':          { name: 'Continue Playing',                 cents: 200 },
  'add-time-30sec-normal':     { name: 'Add Time (+30 sec)',               cents: 199 },
  'add-time-1min-normal':      { name: 'Add Time (+1 min)',                cents: 299 },
  'add-time-15sec-ch5':        { name: 'Add Time (+15 sec)',               cents: 149 },
  'add-time-30sec-ch5':        { name: 'Add Time (+30 sec)',               cents: 199 },
  // Big Smash Wheel spin bundles
  'daily-wheel-1spin':         { name: 'Daily Big Wheel - 1 spin',         cents: 100 },
  'daily-wheel-3spin':         { name: 'Daily Big Wheel - 3 spins',        cents: 200 },
  'weekly-wheel-1spin':        { name: 'Weekly Big Wheel - 1 spin',        cents: 300 },
  'weekly-wheel-3spin':        { name: 'Weekly Big Wheel - 3 spins',       cents: 700 },
  'monthly-wheel-1spin':       { name: 'Monthly Big Wheel - 1 spin',       cents: 500 },
  'monthly-wheel-3spin':       { name: 'Monthly Big Wheel - 3 spins',      cents: 1100 },
  // subscriptions (renew automatically; only sold through Stripe's hosted checkout page)
  'subscribe-weekly':          { name: 'Weekly Subscription',              cents: 599,  interval: 'week' },
  'subscribe-monthly':         { name: 'Monthly Subscription',             cents: 1299, interval: 'month' },
};

/** Checks the item handles sent by the game; throws ClientError for anything unknown or malformed. */
export function resolveItems(handles) {
  if (!Array.isArray(handles) || handles.length < 1 || handles.length > 5) {
    throw new ClientError('Choose between 1 and 5 items.');
  }
  return handles.map((handle) => {
    if (typeof handle !== 'string' || !Object.hasOwn(CATALOG, handle)) {
      throw new ClientError('Unknown item: ' + (typeof handle === 'string' ? handle.slice(0, 60) : 'invalid'));
    }
    return { handle, ...CATALOG[handle] };
  });
}

export const totalCents = (items) => items.reduce((sum, item) => sum + item.cents, 0);

export const isSubscription = (items) => items.some((item) => item.interval);
