import { NextResponse } from 'next/server';
import { AmountError } from '@/lib/operator-money';

/**
 * Wraps a route handler so an amount it cannot read answers 400 with the parse's own Turkish
 * sentence (`toWireDecimal` throws {@link AmountError}). Without it the throw left the handler
 * and the screen showed "Kaydedilemedi (HTTP 500)" (2026-11-19). Any other error is rethrown.
 */
export function refuseUnreadableAmounts<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof AmountError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      throw error;
    }
  };
}
