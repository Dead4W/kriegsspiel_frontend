import type {OverlayItem} from "@/engine/types/overlayTypes.ts";

export class overlaystate {
  private items: OverlayItem[] = []

  list() {
    return this.items
  }

  clear() {
    this.items = []
  }

  set(items: OverlayItem[]) {
    this.items = items
  }

  add(item: OverlayItem) {
    this.items.push(item)
  }
}
