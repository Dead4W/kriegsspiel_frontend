declare module 'vue-virtual-scroller' {
  import type { DefineComponent, VNodeChild, SlotsType } from 'vue'

  export type DefaultSlotProps<T = any> = {
    item: T
    index?: number
    active?: boolean
  }

  export const DynamicScroller: DefineComponent<
    {
      items: any[]
      keyField?: string
      minItemSize?: number
    },
    {},
    {},
    {},
    {},
    {},
    {},
    SlotsType<{
      default(props: DefaultSlotProps): VNodeChild
    }>
  >

  export const DynamicScrollerItem: DefineComponent<{
    item: any
    active?: boolean
    sizeDependencies?: any[]
  }>

  export const RecycleScroller: DefineComponent<any>
}
