export interface WaitTimeInput {
  minutes: number;
  seconds: number;
}

export interface WaitOrderUnit {
  addCommand(command: unknown): void;
  setDirty(): void;
}
