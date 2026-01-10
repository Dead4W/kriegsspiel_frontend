// --------------------
// Типы
// --------------------

type AngleModifier = {
  angle: number;      // градусы
  modifier: number;   // модификатор урона
};

// --------------------
// Тестовая таблица
// --------------------

const angleTable: AngleModifier[] = [
  { angle: -6, modifier: 0.5 },
  { angle: -3, modifier: 0.7 },
  { angle: -1, modifier: 0.85 },
  { angle: 0, modifier: 1.0 },
  { angle: 1, modifier: 1.1 },
  { angle: 3, modifier: 1.25 },
  { angle: 6, modifier: 1.5 },
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
  return radToDeg(Math.atan(deltaH / distance));
}

// --------------------
// Интерполяция модификатора
// --------------------

/**
 * Возвращает модификатор урона по углу с линейной интерполяцией
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
