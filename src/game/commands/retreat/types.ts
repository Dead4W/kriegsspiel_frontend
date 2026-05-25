export interface RetreatTimeInput {
  hours: number;
  minutes: number;
}

export interface RetreatOrderUnit {
  clearCommands(): void;
  setCommands(commands: unknown[]): void;
  setDirty(): void;
}
