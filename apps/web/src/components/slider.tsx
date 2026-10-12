import { Slider as BaseSlider } from '@base-ui/react/slider'
import { type ReactNode } from 'react'
import { cn } from '#/lib/cn'

/** Slider size definitions mapping sizes to their track heights. */
export const KUMO_SLIDER_VARIANTS = {
  size: {
    sm: {
      classes: 'h-6 rounded-md',
      description: 'Compact slider for dense layouts',
    },
    base: {
      classes: 'h-8 rounded-lg',
      description: 'Default slider size',
    },
  },
} as const

export const KUMO_SLIDER_DEFAULT_VARIANTS = {
  size: 'base',
} as const

export type KumoSliderSize = keyof typeof KUMO_SLIDER_VARIANTS.size

export interface KumoSliderVariantsProps {
  /**
   * Height of the slider track.
   * - `"sm"` — Compact slider for dense layouts
   * - `"base"` — Default slider size
   * @default "base"
   */
  size?: KumoSliderSize
}

export function sliderVariants({
  size = KUMO_SLIDER_DEFAULT_VARIANTS.size,
}: KumoSliderVariantsProps = {}) {
  return cn('bg-kumo-recessed p-[3px] ring ring-kumo-line', KUMO_SLIDER_VARIANTS.size[size].classes)
}

type SliderValue = number | readonly number[]

/**
 * Slider component props.
 *
 * @example
 * ```tsx
 * <Slider label="Match count" defaultValue={2} max={5} />
 * <Slider label="Price" defaultValue={[25, 75]} />
 * ```
 */
export interface SliderProps<Value extends SliderValue = SliderValue>
  extends Omit<BaseSlider.Root.Props<Value>, 'children' | 'orientation'>, KumoSliderVariantsProps {
  /** Label displayed above the slider track. */
  label?: ReactNode
  /**
   * Accessible name for each thumb. Use it when there is no visible `label`,
   * or to tell the thumbs of a range slider apart.
   */
  getAriaLabel?: (index: number) => string
  /** Whether to show the min and max labels below the slider. @default true */
  showMinMax?: boolean
}

function countThumbs(value: SliderValue | undefined) {
  return Array.isArray(value) ? value.length : 1
}

/**
 * Lets people pick a number, or a range between two numbers, by dragging a
 * thumb along a track. Pass an array to `value` or `defaultValue` for a range.
 *
 * Official Kumo UI Slider specification.
 *
 * @see https://kumo-ui.com/components/slider/
 * @example
 * ```tsx
 * <Slider label="Volume" defaultValue={40} />
 * ```
 */
export function Slider<Value extends SliderValue = SliderValue>({
  label,
  size = KUMO_SLIDER_DEFAULT_VARIANTS.size,
  getAriaLabel,
  thumbAlignment = 'edge',
  className,
  min = 0,
  max = 100,
  format,
  locale,
  value,
  defaultValue,
  showMinMax = true,
  ...props
}: SliderProps<Value>) {
  const thumbCount = countThumbs(value ?? defaultValue)
  const isRange = thumbCount > 1
  const formatter = new Intl.NumberFormat(locale, format)
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'
  const innerRadius = size === 'sm' ? 'rounded' : 'rounded-md'

  return (
    <BaseSlider.Root
      {...props}
      value={value}
      defaultValue={defaultValue}
      min={min}
      max={max}
      format={format}
      locale={locale}
      thumbAlignment={thumbAlignment}
      orientation="horizontal"
      className={(state) =>
        cn(
          'flex w-full flex-col gap-2 data-disabled:opacity-50',
          typeof className === 'function' ? className(state) : className,
        )
      }
    >
      {label ? (
        <BaseSlider.Label className={cn('font-medium text-kumo-default', textSize)}>
          {label}
        </BaseSlider.Label>
      ) : null}
      <div className={sliderVariants({ size })}>
        <BaseSlider.Control className="h-full">
          <BaseSlider.Track className="relative h-full">
            <BaseSlider.Indicator
              className={cn(
                'box-content! bg-kumo-overlay pr-2 shadow-sm ring ring-kumo-line',
                isRange && '-ml-2 pl-2',
                innerRadius,
              )}
            />
            {Array.from({ length: thumbCount }, (_, index) => (
              <BaseSlider.Thumb
                key={index}
                index={isRange ? index : undefined}
                getAriaLabel={getAriaLabel}
                className={cn(
                  'group h-full w-4 cursor-grab outline-none has-focus-visible:ring-2 has-focus-visible:ring-kumo-focus data-disabled:cursor-not-allowed data-dragging:cursor-grabbing',
                  innerRadius,
                )}
              >
                <span
                  aria-hidden
                  className="absolute top-1/2 left-1/2 h-1/2 w-0.5 -translate-1/2 rounded-full bg-kumo-contrast/25"
                />
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-full left-1/2 mt-[11px] -translate-x-1/2 rounded bg-kumo-contrast px-1.5 font-medium whitespace-nowrap text-kumo-inverse tabular-nums group-data-disabled:bg-kumo-fill group-data-disabled:text-kumo-default',
                    textSize,
                  )}
                >
                  <BaseSlider.Value>{(formattedValues) => formattedValues[index]}</BaseSlider.Value>
                </span>
              </BaseSlider.Thumb>
            ))}
          </BaseSlider.Track>
        </BaseSlider.Control>
      </div>
      {showMinMax ? (
        <div
          aria-hidden
          className={cn('flex justify-between text-kumo-subtle tabular-nums', textSize)}
        >
          <span>{formatter.format(min)}</span>
          <span>{formatter.format(max)}</span>
        </div>
      ) : null}
    </BaseSlider.Root>
  )
}

Slider.displayName = 'Slider'
