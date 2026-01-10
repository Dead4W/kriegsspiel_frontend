import type {uuid} from "@/engine";

export type BattleLogToken =
  | { t: 'text'; v: string }
  | { t: 'i18n'; v: string }
  | { t: 'unit'; u: uuid }
  | { t: 'number'; v: number }
  | { t: 'formula'; v: string }


export interface BattleLogEntry {
  id: number
  time: string
  tokens: BattleLogToken[]
}
