import type { Place } from '../lib/astro';
import { useMoonThumb } from '../moon/thumbs';

export function MoonThumb(props: { date: Date; size: number; className?: string; orientation?: 'horizon' | 'north'; place?: Place | null; style?: React.CSSProperties }) {
  const url = useMoonThumb(props.date, props.size, { orientation: props.orientation, place: props.place });
  return url ? (
    <img className={`moon-thumb ${props.className ?? ''}`} src={url} width={props.size} height={props.size} alt="" draggable={false} style={props.style} />
  ) : (
    <span className={`moon-thumb moon-thumb--empty ${props.className ?? ''}`} style={{ width: props.size, height: props.size, display: 'block', ...props.style }} />
  );
}
