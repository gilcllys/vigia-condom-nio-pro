export const STOCK_MOVE_TYPES = {
  ENTRADA: 'ENTRADA',
  SAIDA: 'SAIDA',
  AJUSTE: 'AJUSTE',
} as const;

export type StockMoveType = (typeof STOCK_MOVE_TYPES)[keyof typeof STOCK_MOVE_TYPES];

export function normalizeStockMoveType(value: string): StockMoveType {
  const normalized = value.trim().toUpperCase();

  if (
    normalized === STOCK_MOVE_TYPES.ENTRADA ||
    normalized === STOCK_MOVE_TYPES.SAIDA ||
    normalized === STOCK_MOVE_TYPES.AJUSTE
  ) {
    return normalized;
  }

  throw new Error(`Tipo de movimentação inválido: ${value}`);
}
