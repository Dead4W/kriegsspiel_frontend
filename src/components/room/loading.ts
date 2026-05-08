export type GameLoadingStage = {
  key: string
  labelKey: string
  progress: number
}

export type GameLoadingState = {
  totalProgress: number
  activeStageKey: string | null
  stages: GameLoadingStage[]
}
