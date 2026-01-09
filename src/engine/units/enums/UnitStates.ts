import type {BaseUnit, StatKey} from "@/engine/units/baseUnit.ts";

export enum UnitEnvironmentState {
  InField = 'in_field', // Поля
  InPlainField = 'in_plain_field', // Пашни
  InSoftField = 'in_soft_field', // Мягкая почва
  InSwampOrDirty = 'in_swamp_or_dirty', // Болото/грязь
  InHouse = 'in_house',
  InCoverHouse = 'in_cover_house',
  InCoverTrenches = 'in_cover_trenches',
  InBrench = 'in_brench',
  InForest = 'in_forest',
  OnRoad = 'on_road',
  OnGoodRoad = 'on_good_road',
  InWater = 'in_water',
}

export const UnitEnvironmentStateIcon: Record<UnitEnvironmentState, string> = {
  [UnitEnvironmentState.InField]: '🌾',            // Поля
  [UnitEnvironmentState.InPlainField]: '🚜',       // Пашни
  [UnitEnvironmentState.InSoftField]: '🟤',        // Мягкая почва
  [UnitEnvironmentState.InSwampOrDirty]: '🪵',     // Болото / грязь

  [UnitEnvironmentState.InBrench]: '🪖',           // Блиндаж

  [UnitEnvironmentState.InCoverTrenches]: '🕳️',   // Окопы / укрытия

  [UnitEnvironmentState.InHouse]: '🏢',
  [UnitEnvironmentState.InCoverHouse]: '🛖',

  [UnitEnvironmentState.InForest]: '🌲',

  [UnitEnvironmentState.OnRoad]: '👣',
  [UnitEnvironmentState.OnGoodRoad]: '🛞',

  [UnitEnvironmentState.InWater]: '🌊',
}

