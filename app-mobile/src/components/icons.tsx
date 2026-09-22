/**
 * Set di icone disegnate a mano invece di @expo/vector-icons.
 *
 * Le Ionicons sono riconoscibili e "da app generica": nei riferimenti
 * (Porsche / Mercedes) le icone sono tratti sottili, geometrici, tutti con
 * lo stesso peso ottico. Qui ogni glifo e' su griglia 24x24, stroke 1.3,
 * terminazioni tonde, nessun riempimento: cosi' restano coerenti fra loro
 * e leggeri sopra la fotografia.
 */
import type { ComponentType } from "react";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

export interface IconProps {
  size?: number;
  color?: string;
  /** Piu' sottile per i glifi grandi, piu' spesso per quelli piccoli. */
  strokeWidth?: number;
}

function icon(render: (p: Required<IconProps>) => React.ReactNode): ComponentType<IconProps> {
  return function Icon({ size = 22, color = "#ffffff", strokeWidth = 1.3 }: IconProps) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {render({ size, color, strokeWidth })}
      </Svg>
    );
  };
}

const S = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const FuelIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M4 20V5.5A1.5 1.5 0 0 1 5.5 4h6A1.5 1.5 0 0 1 13 5.5V20" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="2.5" y1="20" x2="14.5" y2="20" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="4" y1="11" x2="13" y2="11" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M13 9h3.2a1.3 1.3 0 0 1 1.3 1.3V16a1.6 1.6 0 0 0 3.2 0V9.3L19 6.6" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const RangeIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M4 21 9.2 4.5" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M20 21 14.8 4.5" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="12" y1="6" x2="12" y2="9" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="12" y1="12" x2="12" y2="15.5" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="12" y1="18.5" x2="12" y2="21" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const OdometerIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M3.5 17a9 9 0 1 1 17 0" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="m12 13 4.2-4.6" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Circle cx="12" cy="14.2" r="1.5" stroke={color} strokeWidth={strokeWidth} />
  </>
));

export const LockIcon = icon(({ color, strokeWidth }) => (
  <>
    <Rect x="4.5" y="10.5" width="15" height="10" rx="2.4" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const UnlockIcon = icon(({ color, strokeWidth }) => (
  <>
    <Rect x="4.5" y="10.5" width="15" height="10" rx="2.4" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M8 10.5V7.8a4 4 0 0 1 7.6-1.8" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const WindowIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M3.5 13.5h17" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M5 13.5 7.4 6.6A2 2 0 0 1 9.3 5.2h5.4a2 2 0 0 1 1.9 1.4L19 13.5" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M4.5 17h15" stroke={color} strokeWidth={strokeWidth} strokeDasharray="2 3" {...S} />
  </>
));

export const LightIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M3.5 6.5h4.2a6 6 0 0 1 0 11H3.5z" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="13.5" y1="8.5" x2="20.5" y2="8.5" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="13.5" y1="12" x2="20.5" y2="12" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="13.5" y1="15.5" x2="20.5" y2="15.5" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const HornIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M4 9.5h3.5L13 5.5v13L7.5 14.5H4z" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M16.3 9a4.2 4.2 0 0 1 0 6" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M19 6.6a8 8 0 0 1 0 10.8" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const ClimateIcon = icon(({ color, strokeWidth }) => (
  <>
    <Circle cx="12" cy="12" r="2.1" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M12 9.9c0-3 1.2-4.9 3.4-4.9 1.6 0 2.4 1.2 1.9 2.6-.6 1.6-2.4 2.3-5.3 2.3z" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M13.6 13.1c2.6 1.5 3.4 3.5 2.3 5.4-.8 1.4-2.2 1.4-3.1.2-1-1.4-.7-3.3.8-5.6z" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M10.4 12.6c-2.6 1.5-4.7 1.4-5.8-.5-.8-1.4-.1-2.6 1.4-2.7 1.7-.2 3.2 1 4.4 3.2z" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const TireIcon = icon(({ color, strokeWidth }) => (
  <>
    <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={strokeWidth} />
    <Circle cx="12" cy="12" r="3.6" stroke={color} strokeWidth={strokeWidth} />
    <Line x1="12" y1="3.5" x2="12" y2="8.4" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="12" y1="15.6" x2="12" y2="20.5" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="3.5" y1="12" x2="8.4" y2="12" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="15.6" y1="12" x2="20.5" y2="12" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const OilIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M6 14.5h5.5l2.5-2.5h6v4.5a2 2 0 0 1-2 2H9a3 3 0 0 1-3-3z" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M11 9.5c0-1.6 2-4 2-4s2 2.4 2 4a2 2 0 1 1-4 0z" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="3.5" y1="14.5" x2="6" y2="14.5" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const WrenchIcon = icon(({ color, strokeWidth }) => (
  <Path
    d="M15.6 4.4a4.6 4.6 0 0 0-5.9 5.8l-5.2 5.2a1.7 1.7 0 0 0 0 2.4l1.7 1.7a1.7 1.7 0 0 0 2.4 0l5.2-5.2a4.6 4.6 0 0 0 5.8-5.9l-2.6 2.6-2.6-.6-.6-2.6z"
    stroke={color}
    strokeWidth={strokeWidth}
    {...S}
  />
));

export const DoorIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M5 20V6.6a1.6 1.6 0 0 1 1.2-1.5l8.6-2.1A1.6 1.6 0 0 1 16.8 4.6V20z" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="3.5" y1="20" x2="18.5" y2="20" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Circle cx="13.4" cy="12.6" r="1" stroke={color} strokeWidth={strokeWidth} />
  </>
));

/**
 * Coppie chiuso/aperto per porta e finestrino: a distinguerle non e' solo
 * il colore ma il disegno stesso (la porta ruota sul cardine, il vetro
 * scende nella portiera), cosi' lo stato si legge anche in bianco e nero.
 */
export const DoorClosedIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M6 20V6.8a1.6 1.6 0 0 1 1.2-1.6l8-2a1.6 1.6 0 0 1 2 1.6V20" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="4" y1="20" x2="19" y2="20" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Circle cx="14" cy="12.6" r="1" stroke={color} strokeWidth={strokeWidth} />
  </>
));

export const DoorOpenIcon = icon(({ color, strokeWidth }) => (
  <>
    <Line x1="5" y1="3.5" x2="5" y2="20" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M8.5 20V9.4a1.6 1.6 0 0 1 1.1-1.5l7-2.3A1.6 1.6 0 0 1 18.7 7.1V20" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="3" y1="20" x2="21" y2="20" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M5 6.2 8.5 9.4" stroke={color} strokeWidth={strokeWidth} strokeDasharray="1.5 2" {...S} />
  </>
));

export const WindowClosedIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M4 19V9.6a2 2 0 0 1 .6-1.4l3-3A2 2 0 0 1 9 4.6h6.6a2 2 0 0 1 2 2V19z" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="4" y1="16" x2="17.6" y2="16" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const WindowOpenIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M4 19V9.6a2 2 0 0 1 .6-1.4l3-3A2 2 0 0 1 9 4.6h6.6a2 2 0 0 1 2 2V19z" stroke={color} strokeWidth={strokeWidth} strokeDasharray="2.5 2.5" {...S} />
    <Line x1="4" y1="16" x2="17.6" y2="16" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M10.8 8.2 14 11.4l3.2-3.2" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const TrunkIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M3 16.5v-1a9 9 0 0 1 18 0v1" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="3" y1="19.5" x2="21" y2="19.5" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M7 16.5v3M17 16.5v3" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const AlertIcon = icon(({ color, strokeWidth }) => (
  <>
    <Circle cx="12" cy="12" r="8.6" stroke={color} strokeWidth={strokeWidth} />
    <Line x1="12" y1="7.6" x2="12" y2="13" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Line x1="12" y1="16.2" x2="12" y2="16.3" stroke={color} strokeWidth={strokeWidth * 1.6} {...S} />
  </>
));

export const CheckIcon = icon(({ color, strokeWidth }) => (
  <>
    <Circle cx="12" cy="12" r="8.6" stroke={color} strokeWidth={strokeWidth} />
    <Path d="m8.2 12.2 2.6 2.6 5-5.4" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const LeafIcon = icon(({ color, strokeWidth }) => (
  <>
    <Path d="M20 4c-9 0-13.5 3.3-13.5 8.2A5.3 5.3 0 0 0 11.8 17.5C16.6 17.5 20 13 20 4z" stroke={color} strokeWidth={strokeWidth} {...S} />
    <Path d="M16.5 7.5C11 9.5 7.5 14 6 20" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const BrakeIcon = icon(({ color, strokeWidth }) => (
  <>
    <Circle cx="12" cy="12" r="8.6" stroke={color} strokeWidth={strokeWidth} />
    <Circle cx="12" cy="12" r="4.6" stroke={color} strokeWidth={strokeWidth} strokeDasharray="1.6 2.4" />
    <Path d="M3.6 9.6h3M17.4 9.6h3M3.6 14.4h3M17.4 14.4h3" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const RouteIcon = icon(({ color, strokeWidth }) => (
  <>
    <Circle cx="6" cy="6.5" r="2.4" stroke={color} strokeWidth={strokeWidth} />
    <Circle cx="18" cy="17.5" r="2.4" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M8.4 6.5h5a3.5 3.5 0 0 1 0 7h-3a3.5 3.5 0 0 0 0 7h5.2" stroke={color} strokeWidth={strokeWidth} strokeDasharray="2.5 3" {...S} />
  </>
));

export const ClockIcon = icon(({ color, strokeWidth }) => (
  <>
    <Circle cx="12" cy="12" r="8.6" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M12 7.2V12l3.2 2" stroke={color} strokeWidth={strokeWidth} {...S} />
  </>
));

export const ChevronIcon = icon(({ color, strokeWidth }) => (
  <Path d="m9 5.5 6.5 6.5L9 18.5" stroke={color} strokeWidth={strokeWidth} {...S} />
));

