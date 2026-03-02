// --------------------
// Типы
// --------------------

import { getResourcePack } from "@/engine/assets/resourcepack.ts";

type AngleModifier = {
  angle: number;      // градусы
  modifier: number;   // модификатор урона
};

// --------------------
// Таблица модификаторов
// --------------------

function getAngleTable(): AngleModifier[] {
  const table = getResourcePack()?.angleModifiers;
  if (!Array.isArray(table) || table.length === 0) return [];

  const cleaned = table
    .map((x) => ({
      angle: Number((x as any)?.angle),
      modifier: Number((x as any)?.modifier),
    }))
    .filter((x) => Number.isFinite(x.angle) && Number.isFinite(x.modifier))
    .sort((a, b) => a.angle - b.angle);

  return cleaned.length ? cleaned : [];
}

// --------------------
// Утилиты
// --------------------

function radToDeg(rad: number): number {
  return rad * 180 / Math.PI;
}

// --------------------
// Расчёт угла по высотам
// --------------------

/**
 * Возвращает угол в градусах между двумя высотами
 * @param h1 высота атакующего
 * @param h2 высота цели
 * @param distance горизонтальная дистанция
 */
export function getAngle(
  h1: number,
  h2: number,
  distance: number
): number {
  if (distance === 0) {
    return 0;
  }

  const deltaH = h1 - h2;
  return radToDeg(Math.atan2(deltaH, distance));
}

// --------------------
// Интерполяция модификатора
// --------------------

/**
 * Возвращает модификатор урона по углу с линейной интерполяцией
 * @param angle угол в градусах
 */
export function getDamageModifier(angle: number): number {
  const angleTable = getAngleTable();

  if (!angleTable.length) return 1.0;

  // Ниже минимума
  if (angle <= angleTable[0]!.angle) {
    return angleTable[0]!.modifier;
  }

  // Выше максимума
  if (angle >= angleTable[angleTable.length - 1]!.angle) {
    return angleTable[angleTable.length - 1]!.modifier;
  }

  // Поиск диапазона
  for (let i = 0; i < angleTable.length - 1; i++) {
    const a1 = angleTable[i]!;
    const a2 = angleTable[i + 1]!;

    if (angle >= a1.angle && angle <= a2.angle) {
      const t = (angle - a1.angle) / (a2.angle - a1.angle);
      return a1.modifier + t * (a2.modifier - a1.modifier);
    }
  }

  return 1.0;
}

// --------------------
// Комплексная функция
// --------------------

/**
 * Сразу считает модификатор урона по высотам
 */
export function getDamageModifierByHeights(
  h1: number,
  h2: number,
  distance: number
): number {
  const angle = getAngle(h1, h2, distance);
  return getDamageModifier(angle);
}
