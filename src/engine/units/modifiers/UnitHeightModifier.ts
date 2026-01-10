// --------------------
// Типы
// --------------------

type AngleModifier = {
  angle: number;      // градусы
  modifier: number;   // модификатор урона
};

// --------------------
// Таблица модификаторов
// --------------------

const angleTable: AngleModifier[] = [
  { angle: 0, modifier: 1.0 },
  { angle: 5, modifier: 0.9 },
  { angle: 10, modifier: 0.8 },
  { angle: 15, modifier: 0.6 },
];

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
 * Возвращает АБСОЛЮТНЫЙ угол в градусах между двумя высотами
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
  const angleRad = Math.atan(deltaH / distance);

  return Math.abs(radToDeg(angleRad));
}

// --------------------
// Интерполяция модификатора
// --------------------

/**
 * Возвращает модификатор урона по абсолютному углу
 * @param angle угол в градусах
 */
export function getDamageModifier(angle: number): number {
  // Ниже минимума
  if (angle <= angleTable[0]!.angle) {
    return angleTable[0]!.modifier;
  }

  // Выше максимума
  if (angle >= angleTable[angleTable.length - 1]!.angle) {
    return angleTable[angleTable.length - 1]!.modifier;
  }

  // Поиск диапазона + линейная интерполяция
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
