export enum UnitEnvironmentState {
  InHouse = 'in_house',
  InCoverHouse = 'in_cover_house',
  InForest = 'in_forest',
  OnRoad = 'on_road',
  OnGoodRoad = 'on_good_road',
  InWater = 'in_water',
}

export const UnitEnvironmentStateIcon: Record<UnitEnvironmentState, string> = {
  [UnitEnvironmentState.InHouse]: '🏢',
  [UnitEnvironmentState.InCoverHouse]: '🛖',
  [UnitEnvironmentState.InForest]: '🌲',
  [UnitEnvironmentState.OnRoad]: '👣',
  [UnitEnvironmentState.OnGoodRoad]: '🛞',
  [UnitEnvironmentState.InWater]: '🌊',
}

