import type { SingleParserBuilder } from 'nuqs'

/** 标准分页参数名 */
export type StandardPaginationKeys = 'page' | 'page_size'

/** 标准主查询与排序参数名 */
export type StandardPrimaryKeys =
  | 'kw'
  | 'field'
  | 'order'
  | 'time_field'
  | 'range_time'

/**
 * 从完整 API Query 类型中提取纯筛选字段（剔除 pagination 与 primary 参数）
 */
export type FilterParamsOf<
  TQuery,
  CustomPrimary extends keyof NonNullable<TQuery> = never,
  CustomPagination extends keyof NonNullable<TQuery> = never,
> = Omit<
  NonNullable<TQuery>,
  StandardPaginationKeys | StandardPrimaryKeys | CustomPrimary | CustomPagination
>

/**
 * 提取主参数（kw、排序等）
 */
export type PrimaryParamsOf<
  TQuery,
  CustomPrimary extends keyof NonNullable<TQuery> = never,
> = Pick<
  NonNullable<TQuery>,
  Extract<keyof NonNullable<TQuery>, StandardPrimaryKeys | CustomPrimary>
>

/**
 * 提取分页参数
 */
export type PaginationParamsOf<
  TQuery,
  CustomPagination extends keyof NonNullable<TQuery> = never,
> = Pick<
  NonNullable<TQuery>,
  Extract<keyof NonNullable<TQuery>, StandardPaginationKeys | CustomPagination>
>

/**
 * 将字段值类型 V 映射到对应的 nuqs SingleParserBuilder 类型约束
 */
export type QueryFieldParser<V> = SingleParserBuilder<NonNullable<V>>

/**
 * 筛选器 Parser 映射基线约束类型
 */
export type FilterParserConstraint<TQuery> = {
  [K in keyof FilterParamsOf<TQuery>]?: QueryFieldParser<FilterParamsOf<TQuery>[K]>
}

/**
 * 严格筛选器声明工厂：
 * 采用「柯里化工厂 + Exclude 交集校验」模式：
 * 1. 泛型 TQuery 由第一阶段指定，锁定契约边界；
 * 2. 第二阶段精确推断具体 Parser 映射 P，保留 .withDefault() 的非空推导，不发生类型擦除；
 * 3. 产生多余键（拼写错误）时报错：Type '...' is not assignable to type 'never'；
 * 4. 字段类型不兼容时报错：Type '...' is not assignable to 'SingleParserBuilder<...>'。
 */
export function defineFilterParsers<TQuery>() {
  return function declareParsers<P extends FilterParserConstraint<TQuery>>(
    parsers: P & Record<Exclude<keyof P, keyof FilterParamsOf<TQuery>>, never>,
  ): P {
    return parsers
  }
}
